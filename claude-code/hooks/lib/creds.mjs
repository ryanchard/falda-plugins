/**
 * Credential + feature-flag resolution.
 *
 * Reads exactly the same environment variables the plugin's .mcp.json
 * interpolates, so the hooks and the model's MCP tools cannot address
 * different tenants. This is opencode's core discipline, reproduced by
 * construction rather than by a config lookup.
 */

/**
 * `https://h/mcp` -> `https://h`. FALDA's HTTP routes (`/auth/*`,
 * `/pools/*`, `/healthz`) live on the same host and port as the MCP
 * endpoint, one level up, so every caller derives them from the one
 * configured URL rather than carrying a second setting.
 */
export function apiBase(mcpUrl) { return mcpUrl.replace(/\/mcp\/?$/, "").replace(/\/$/, ""); }

/**
 * Resolve MCP credentials, or null if this project has no FALDA tenant.
 *
 * `pool` and `recallScope` are set only when their variables are non-empty,
 * so an unbound project's credentials object is byte-for-byte what it was
 * before pools existed — an empty FALDA_POOL must never be sent as a store
 * name.
 */
export function resolveCreds(env = process.env) {
  const mcpUrl = env.FALDA_MCP_URL ?? "http://localhost:8079/mcp";
  const token = env.FALDA_TOKEN;
  const tenant = env.FALDA_TENANT;
  if (!token || !tenant) return null;
  const creds = { mcpUrl, token, tenant };
  // The bound Globus group (`/falda-memory:pool`), written into this
  // project's .claude/settings.json — the same variable .mcp.json
  // interpolates into X-Falda-Pool, so the hooks and the model's MCP tools
  // cannot address different stores.
  if (env.FALDA_POOL) creds.pool = env.FALDA_POOL;
  // "all" | "pool" | "self"; unset lets the server choose (union when a
  // pool is addressed, private otherwise).
  if (env.FALDA_RECALL_SCOPE) creds.recallScope = env.FALDA_RECALL_SCOPE;
  return creds;
}

/** Feature gating. Every feature is on unless its var is exactly "0" —
 *  EXCEPT captureTools, which is opt-IN (must be exactly "1"). Tool capture
 *  multiplies row count and ships tool output to the distillation LLM, so it
 *  is not something a user should acquire by upgrading. */
export function features(env = process.env) {
  const on = (v) => v !== "0";
  const capture = on(env.FALDA_CAPTURE);
  return {
    capture,
    autoRecall: on(env.FALDA_AUTO_RECALL),
    distillOnCompact: on(env.FALDA_DISTILL_ON_COMPACT),
    // Post-compaction recall re-surfaces detail the compaction summary
    // dropped, which only exists in T0 if capture is writing there.
    recallOnCompact: capture && on(env.FALDA_RECALL_ON_COMPACT),
    // Same dependency, same reason: tool rows without prose rows is not a
    // coherent state.
    captureTools: capture && env.FALDA_CAPTURE_TOOLS === "1",
  };
}
