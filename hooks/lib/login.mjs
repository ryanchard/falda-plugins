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
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  existsSync,
  chmodSync,
  openSync,
  closeSync,
  renameSync,
  realpathSync,
  accessSync,
  constants,
} from "node:fs";
import { join } from "node:path";
import { homedir, hostname } from "node:os";
import { spawn } from "node:child_process";
import { stateDir as defaultStateDir } from "./state.mjs";

export const DEFAULT_CLIENT_ID = "ce244ab8-7c9d-48a4-aa55-fe82d615afd6";
export const DEFAULT_MCP_URL = "https://falda.cairnscore.ai/mcp";
const AUTHORIZE_URL = "https://auth.globus.org/v2/oauth2/authorize";
const TOKEN_URL = "https://auth.globus.org/v2/oauth2/token";
const REDIRECT = "https://auth.globus.org/v2/web/auth-code";
const STATE_TTL_MS = 10 * 60_000;

/** `https://h/mcp` -> `https://h`; the auth routes live on the same host/port as the MCP endpoint, one level up. */
export function apiBase(mcpUrl) { return mcpUrl.replace(/\/mcp\/?$/, "").replace(/\/$/, ""); }
const b64u = (buf) => Buffer.from(buf).toString("base64url");
function stateFile(dir) { return join(dir, "login.json"); }

export async function openBrowser(url) {
  const cmd = process.platform === "darwin" ? ["open", url] : process.platform === "win32" ? ["cmd", "/c", "start", "", url] : ["xdg-open", url];
  return new Promise((resolve) => { try { const p = spawn(cmd[0], cmd.slice(1), { stdio: "ignore", detached: true }); p.on("error", () => resolve(false)); p.unref(); resolve(true); } catch { resolve(false); } });
}

export async function startLogin(opts = {}) {
  const env = opts.env ?? process.env;
  const clientId = opts.clientId || env.FALDA_LOGIN_CLIENT_ID || DEFAULT_CLIENT_ID;
  const dir = opts.stateDir ?? defaultStateDir(env);
  const verifier = b64u(randomBytes(32)); const challenge = b64u(createHash("sha256").update(verifier).digest());
  const state = b64u(randomBytes(16));
  const url = new URL(AUTHORIZE_URL);
  for (const [k, v] of Object.entries({ client_id: clientId, redirect_uri: REDIRECT, scope: "openid profile email", response_type: "code", state, code_challenge: challenge, code_challenge_method: "S256", access_type: "online" })) url.searchParams.set(k, v);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(stateFile(dir), JSON.stringify({ state, verifier, client_id: clientId, url: url.toString(), created_at: (opts.now ?? Date.now)() }), { mode: 0o600 });
  chmodSync(stateFile(dir), 0o600);
  await (opts.open ?? openBrowser)(url.toString());
  return { url: url.toString() };
}

/** Parse settingsPath's existing content, or throw a message naming the path. Caller checks existence first. */
function parseSettingsFileOrThrow(settingsPath) {
  const raw = readFileSync(settingsPath, "utf8");
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`${settingsPath} is not valid JSON (${err.message}) — fix it and re-run`);
  }
}

/**
 * Pre-flight check, run before the one-time authorization code is
 * exchanged: fail fast on a broken or unwritable settings target rather
 * than burn the code and only then discover the write can't happen.
 */
function assertSettingsWritable(settingsPath) {
  if (existsSync(settingsPath)) parseSettingsFileOrThrow(settingsPath);
  const dir = join(settingsPath, "..");
  mkdirSync(dir, { recursive: true });
  accessSync(dir, constants.W_OK);
}

export function writeClaudeSettings(settingsPath, { url, token, tenant }) {
  const exists = existsSync(settingsPath);
  const doc = exists ? parseSettingsFileOrThrow(settingsPath) : {};
  let backupPath;
  if (exists) {
    backupPath = `${settingsPath}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    // Create the backup already restricted to 0600 via an exclusive open —
    // copyFileSync followed by a later chmodSync would leave the backup
    // briefly world-readable under the process umask.
    const fd = openSync(backupPath, "wx", 0o600);
    try { writeFileSync(fd, readFileSync(settingsPath)); } finally { closeSync(fd); }
  }
  doc.env = { ...(doc.env ?? {}), FALDA_MCP_URL: url, FALDA_TOKEN: token, FALDA_TENANT: tenant };
  const dir = join(settingsPath, "..");
  mkdirSync(dir, { recursive: true });
  // Atomic write: write the new content to a temp file, then rename onto
  // the real target. Renaming onto realpathSync(settingsPath) — rather
  // than settingsPath itself — preserves symlink behaviour: a symlinked
  // settings file keeps pointing at the same real file instead of being
  // replaced by a plain file at the symlink's location.
  const target = exists ? realpathSync(settingsPath) : settingsPath;
  const tmp = `${target}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(doc, null, 2) + "\n", { mode: 0o600 });
  try {
    renameSync(tmp, target);
  } catch (err) {
    rmSync(tmp, { force: true });
    throw err;
  }
  return { backupPath };
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
  if (!tokResp.ok || !tok.id_token) throw new Error(`Globus rejected the code (${tokResp.status}): ${tok.error_description ?? tok.error ?? "no id_token"}`);
  const mcpUrl = opts.url ?? env.FALDA_MCP_URL ?? DEFAULT_MCP_URL;
  const loginResp = await f(`${apiBase(mcpUrl)}/auth/login`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ id_token: tok.id_token, label: opts.label ?? `${hostname()} claude-code` }) });
  const login = await loginResp.json().catch(() => ({}));
  if (!loginResp.ok || !login.api_key) throw new Error(`FALDA login failed (${loginResp.status}): ${login.error ?? "unknown"}${login.reason ? ` (${login.reason})` : ""}`);
  const out = { tenant: login.tenant, api_key: login.api_key };
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
