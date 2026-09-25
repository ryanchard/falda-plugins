#!/usr/bin/env node
/**
 * CLI behind `/falda-memory:pool` — bind this project to a Globus group so
 * its sessions capture into, and recall from, the group's shared memory.
 *
 * Usage:
 *   pool.mjs                       list the groups you can use
 *   pool.mjs <name|uuid>           bind this project to that group
 *   pool.mjs --clear               unbind this project
 *
 * Flags: --settings <path> (default <cwd>/.claude/settings.json)
 *
 * INVARIANT: never prints FALDA_TOKEN, and never prints the settings file.
 */
import { join } from "node:path";
import { resolveCreds } from "./lib/creds.mjs";
import { listPools, resolvePool, writeProjectPool } from "./lib/pool.mjs";

function parseArgs(argv) {
  const positional = [];
  const flags = { clear: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--clear") flags.clear = true;
    else if (a === "--settings") flags.settings = argv[++i];
    else positional.push(a);
  }
  return { positional, flags };
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const settingsPath = flags.settings ?? join(process.cwd(), ".claude", "settings.json");

  if (flags.clear) {
    const { backupPath } = writeProjectPool(settingsPath, null);
    const backupClause = backupPath ? ` (backup ${backupPath})` : "";
    process.stdout.write(`Unbound this project — memory goes to your private store again. Removed FALDA_POOL from ${settingsPath}${backupClause}. Start a new Claude Code session.\n`);
    return;
  }

  const creds = resolveCreds(process.env);
  if (!creds) throw new Error("not signed in — run /falda-memory:login first");

  const pools = await listPools(creds);

  if (positional.length === 0) {
    if (pools.length === 0) {
      process.stdout.write("You are not in any FALDA pools. Pools are Globus groups: join one at app.globus.org/groups, then run /falda-memory:login again so FALDA sees the membership (accept the Groups consent when asked).\n");
      return;
    }
    process.stdout.write(pools.map((p) => `${p.name} — ${p.id}${p.role ? ` (${p.role})` : ""}`).join("\n") + "\n");
    return;
  }

  const target = resolvePool(positional.join(" "), pools);
  const { backupPath } = writeProjectPool(settingsPath, target.id);
  const backupClause = backupPath ? ` (backup ${backupPath})` : "";
  process.stdout.write(`Bound this project to ${target.name} (${target.id}). Wrote FALDA_POOL to ${settingsPath}${backupClause}. Start a new Claude Code session.\n`);
}

main().catch((err) => {
  process.stderr.write(`${err?.message ?? String(err)}\n`);
  process.exitCode = 1;
});
