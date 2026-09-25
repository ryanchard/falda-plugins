/**
 * Two-step Globus PKCE login for the Claude Code plugin.
 *
 * The registered OAuth client's redirect is Globus's own "show the code"
 * page (the plugin runs from a non-interactive tool call, so it cannot
 * host a redirect listener), so this is split into `startLogin` (open the
 * browser, stash the PKCE verifier + state) and `finishLogin` (exchange
 * the code the user pastes back, log in to FALDA, write credentials).
 *
 * `login.json` in the state dir carries the PKCE verifier across the two
 * steps and is deleted as soon as it's consumed (success or expiry).
 */
import { randomBytes, createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { homedir, hostname } from "node:os";
import { spawn } from "node:child_process";
import { stateDir as defaultStateDir } from "./state.mjs";
import { apiBase } from "./creds.mjs";
import { assertSettingsWritable, writeSettingsEnv } from "./settings.mjs";

export const DEFAULT_CLIENT_ID = "ce244ab8-7c9d-48a4-aa55-fe82d615afd6";
export const DEFAULT_MCP_URL = "https://falda.cairnscore.ai/mcp";
const AUTHORIZE_URL = "https://auth.globus.org/v2/oauth2/authorize";
const TOKEN_URL = "https://auth.globus.org/v2/oauth2/token";
const REDIRECT = "https://auth.globus.org/v2/web/auth-code";
const STATE_TTL_MS = 10 * 60_000;
const BASE_SCOPES = "openid profile email";
const CONFIG_TIMEOUT_MS = 5000;

// `apiBase` now lives in creds.mjs (the hooks need it too); re-exported
// here because this module has always been where callers imported it from.
export { apiBase };
const b64u = (buf) => Buffer.from(buf).toString("base64url");
function stateFile(dir) { return join(dir, "login.json"); }

export async function openBrowser(url) {
  const cmd = process.platform === "darwin" ? ["open", url] : process.platform === "win32" ? ["cmd", "/c", "start", "", url] : ["xdg-open", url];
  return new Promise((resolve) => { try { const p = spawn(cmd[0], cmd.slice(1), { stdio: "ignore", detached: true }); p.on("error", () => resolve(false)); p.unref(); resolve(true); } catch { resolve(false); } });
}

/**
 * Ask the server which Globus client to log in with and which scope to
 * request: `POST <base>/auth/config {}` (unauthenticated) ->
 * `{login_client_id, service_scope}`. The plugin cannot know the service
 * client id — only the server does — and a 0.3-era server does not have
 * the route at all, so every failure here falls back to the id_token
 * login this plugin shipped with rather than blocking the user.
 */
export async function fetchAuthConfig(mcpUrl, f = fetch) {
  try {
    const res = await f(`${apiBase(mcpUrl)}/auth/config`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(CONFIG_TIMEOUT_MS),
    });
    if (!res.ok) return {};
    const cfg = await res.json();
    return {
      loginClientId: typeof cfg?.login_client_id === "string" && cfg.login_client_id ? cfg.login_client_id : undefined,
      serviceScope: typeof cfg?.service_scope === "string" && cfg.service_scope ? cfg.service_scope : undefined,
    };
  } catch {
    return {};
  }
}

export async function startLogin(opts = {}) {
  const env = opts.env ?? process.env;
  const dir = opts.stateDir ?? defaultStateDir(env);
  const mcpUrl = opts.url ?? env.FALDA_MCP_URL ?? DEFAULT_MCP_URL;
  const cfg = await fetchAuthConfig(mcpUrl, opts.fetch ?? fetch);
  const clientId = opts.clientId || env.FALDA_LOGIN_CLIENT_ID || cfg.loginClientId || DEFAULT_CLIENT_ID;
  const serviceScope = opts.scope || cfg.serviceScope;
  // The FALDA scope goes FIRST: Globus returns the top-level
  // `access_token` of a token response for the first resource server in
  // the requested scope list, and that is the token `/auth/login`
  // introspects. `openid profile email` first would make the top-level
  // token an Auth-scoped one and the login would fail on audience.
  // `access_type=offline` is what lets the service obtain dependent
  // Groups tokens it can refresh for membership.
  const scope = serviceScope ? `${serviceScope} ${BASE_SCOPES}` : BASE_SCOPES;
  const verifier = b64u(randomBytes(32)); const challenge = b64u(createHash("sha256").update(verifier).digest());
  const state = b64u(randomBytes(16));
  const url = new URL(AUTHORIZE_URL);
  for (const [k, v] of Object.entries({ client_id: clientId, redirect_uri: REDIRECT, scope, response_type: "code", state, code_challenge: challenge, code_challenge_method: "S256", access_type: serviceScope ? "offline" : "online" })) url.searchParams.set(k, v);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(stateFile(dir), JSON.stringify({ state, verifier, client_id: clientId, service_scope: serviceScope, url: url.toString(), created_at: (opts.now ?? Date.now)() }), { mode: 0o600 });
  chmodSync(stateFile(dir), 0o600);
  await (opts.open ?? openBrowser)(url.toString());
  return { url: url.toString() };
}

export function writeClaudeSettings(settingsPath, { url, token, tenant }) {
  return writeSettingsEnv(settingsPath, { FALDA_MCP_URL: url, FALDA_TOKEN: token, FALDA_TENANT: tenant });
}

/**
 * Pick the access token to send to `/auth/login`.
 *
 * Globus puts ONE resource server's token at the top level of a token
 * response and the rest in `other_tokens`; which one is top-level depends
 * on the scope order, so choose by `scope` rather than by position and
 * only fall back to the top-level token when nothing declares the scope.
 * Substring matching, not word equality: a requested scope can come back
 * decorated (`*<scope>`, or with `[...]` dependent qualifiers).
 */
export function pickScopedToken(tok, serviceScope) {
  if (!serviceScope) return undefined;
  const candidates = [tok, ...(Array.isArray(tok?.other_tokens) ? tok.other_tokens : [])];
  const scoped = candidates.find(
    (t) => t && typeof t.access_token === "string" && t.access_token && typeof t.scope === "string" && t.scope.includes(serviceScope),
  );
  if (scoped) return scoped.access_token;
  return typeof tok?.access_token === "string" && tok.access_token ? tok.access_token : undefined;
}

export async function finishLogin(code, opts = {}) {
  const env = opts.env ?? process.env; const f = opts.fetch ?? fetch; const now = opts.now ?? Date.now;
  const dir = opts.stateDir ?? defaultStateDir(env);
  if (!existsSync(stateFile(dir))) throw new Error("no login in progress — run `login start` first");
  const st = JSON.parse(readFileSync(stateFile(dir), "utf8"));
  if (now() - st.created_at > STATE_TTL_MS) { rmSync(stateFile(dir), { force: true }); throw new Error("login expired — run `login start` again"); }

  const settingsPath = opts.settingsPath ?? join(homedir(), ".claude", "settings.json");
  // Validate the settings target before spending the one-time code: a
  // broken settings file or an unwritable directory should fail here,
  // leaving the state file (and the code) usable for a retry.
  if (opts.write !== false) assertSettingsWritable(settingsPath);

  const clientId = opts.clientId ?? st.client_id;
  const tokResp = await f(opts.tokenUrl ?? TOKEN_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code: String(code).trim(), redirect_uri: REDIRECT, client_id: clientId, code_verifier: st.verifier }).toString() });
  const tok = await tokResp.json().catch(() => ({}));
  // With a service scope, post the FALDA-scoped access token; without one
  // (a 0.3-era server, or a user who declined) the id_token login still
  // works for one release.
  const accessToken = pickScopedToken(tok, st.service_scope);
  if (!tokResp.ok || (!accessToken && !tok.id_token)) throw new Error(`Globus rejected the code (${tokResp.status}): ${tok.error_description ?? tok.error ?? "no token in the response"}`);
  const mcpUrl = opts.url ?? env.FALDA_MCP_URL ?? DEFAULT_MCP_URL;
  const credential = accessToken ? { access_token: accessToken } : { id_token: tok.id_token };
  const loginResp = await f(`${apiBase(mcpUrl)}/auth/login`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...credential, label: opts.label ?? `${hostname()} claude-code` }) });
  const login = await loginResp.json().catch(() => ({}));
  if (!loginResp.ok || !login.api_key) {
    // A 401 on the access-token path is almost always a consent problem:
    // the token FALDA introspected is not one it can accept (wrong
    // audience, missing scope), which the user fixes by logging in again
    // and granting the FALDA consent — not something a retry alone cures.
    const hint = accessToken && loginResp.status === 401
      ? " — re-run /falda-memory:login and accept the FALDA consent"
      : "";
    throw new Error(`FALDA login failed (${loginResp.status}): ${login.error ?? "unknown"}${login.reason ? ` (${login.reason})` : ""}${hint}`);
  }
  const out = {
    tenant: login.tenant,
    api_key: login.api_key,
    user: login.user,
    created: login.created,
    // Printed by the CLI so the user can see which groups this login can
    // share memory with. Names only — never the key.
    groups: Array.isArray(login.groups) ? login.groups : [],
    groups_status: login.groups_status,
  };
  if (opts.write === false) { rmSync(stateFile(dir), { force: true }); return out; }
  // The state file (and thus the ability to retry with the same PKCE
  // verifier) is only released once the settings write has actually
  // succeeded — the code itself was already consumed by the exchange
  // above, so a write failure here must not also strand the user without
  // any way to know a fresh `login start` is required.
  let written;
  try {
    written = writeClaudeSettings(settingsPath, { url: mcpUrl, token: login.api_key, tenant: login.tenant });
  } catch (err) {
    throw new Error(`${err.message} — your API key was created but not saved; run \`login start\` again to get a new one, or use --print`);
  }
  rmSync(stateFile(dir), { force: true });
  return { ...out, settingsPath, backupPath: written.backupPath };
}
