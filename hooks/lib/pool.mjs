/**
 * Pool binding for the Claude Code plugin.
 *
 * A pool IS a Globus group: its id is the group UUID and its name is the
 * group's name. Binding a project means writing `env.FALDA_POOL=<uuid>`
 * into that project's `.claude/settings.json`, which both the hooks
 * (`creds.mjs`) and the model's MCP connection (`.mcp.json`'s
 * `X-Falda-Pool` header) read — the same single source the tenant uses,
 * so the two can never address different stores.
 *
 * Unlike the hook libraries, these functions THROW on failure: their only
 * callers are `hooks/pool.mjs` and the `/falda-memory:pool` command, where
 * a silent no-op would leave the user believing memory is shared when it
 * is not.
 */
import { apiBase } from "./login.mjs";
import { writeSettingsEnv } from "./settings.mjs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMEOUT_MS = 10_000;

/** True for a group-pool identifier (a Globus group UUID). */
export function isPoolUuid(s) { return UUID_RE.test(String(s).trim()); }

/** `POST <base>/pools/mine` -> the pools this key's user may use. */
export async function listPools(creds, f = fetch) {
  const res = await f(`${apiBase(creds.mcpUrl)}/pools/mine`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.token}`,
      "X-Falda-Tenant": creds.tenant,
      "content-type": "application/json",
    },
    body: "{}",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`could not list pools (${res.status}): ${body.error ?? "unknown"}${body.reason ? ` (${body.reason})` : ""}`);
  return Array.isArray(body.pools) ? body.pools : [];
}

/**
 * Resolve what the user typed to `{id, name}`.
 *
 * A UUID is taken verbatim (lowercased) even when it is not in `pools` —
 * the server is the authority on membership, and answering "not a member"
 * there is better than a client-side guess. A name must match exactly one
 * pool, case-insensitively.
 */
export function resolvePool(arg, pools) {
  const raw = String(arg ?? "").trim();
  if (!raw) throw new Error("no pool given");
  if (UUID_RE.test(raw)) {
    const id = raw.toLowerCase();
    const known = pools.find((p) => String(p.id).toLowerCase() === id);
    return { id, name: known?.name ?? id };
  }
  const needle = raw.toLowerCase();
  const hits = pools.filter((p) => String(p.name ?? "").trim().toLowerCase() === needle);
  if (hits.length === 1) return { id: String(hits[0].id).toLowerCase(), name: hits[0].name };
  if (hits.length === 0) {
    throw new Error(`no pool named "${raw}" — run /falda-memory:pool with no argument to list the ones you can use`);
  }
  const candidates = hits.map((p) => `  ${p.name} — ${p.id}`).join("\n");
  throw new Error(`"${raw}" matches ${hits.length} groups — bind by UUID instead:\n${candidates}`);
}

/** Set (uuid) or clear (null) `env.FALDA_POOL` in a settings file. */
export function writeProjectPool(settingsPath, uuid) {
  return writeSettingsEnv(settingsPath, { FALDA_POOL: uuid ?? null });
}
