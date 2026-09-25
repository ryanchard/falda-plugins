#!/usr/bin/env node
/**
 * CLI for the Globus PKCE login (see hooks/lib/login.mjs).
 *
 * Usage:
 *   login.mjs start                 open the Globus sign-in page, stash PKCE state
 *   login.mjs finish <code>         exchange the code, log in to FALDA, write settings
 *
 * Flags: --url <mcp-url>, --client-id <id>, --label <label>, --print
 *
 * `commands/login.md` is the only intended caller in normal use — it runs
 * this script with Bash and relays stdout to the user — but the script is
 * also meant to be run directly by self-hosters and other tools.
 *
 * INVARIANT: the API key is never printed unless --print is given, and
 * --print prints ONLY the key (no tenant, no settings path) and writes
 * nothing to disk.
 */
import { startLogin, finishLogin } from "./lib/login.mjs";

function parseArgs(argv) {
  const positional = [];
  const flags = { print: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--print") flags.print = true;
    else if (a === "--url") flags.url = argv[++i];
    else if (a === "--client-id") flags.clientId = argv[++i];
    else if (a === "--label") flags.label = argv[++i];
    else if (a === "--scope") flags.scope = argv[++i];
    else positional.push(a);
  }
  return { positional, flags };
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const [command, ...rest] = positional;

  if (command === "start") {
    const { url } = await startLogin({ clientId: flags.clientId, url: flags.url, scope: flags.scope });
    process.stdout.write(`Open this link, sign in, then run: /falda-memory:login <code>\n${url}\n`);
    return;
  }

  if (command === "finish") {
    const code = rest[0];
    if (!code) throw new Error("usage: login.mjs finish <code>");
    const out = await finishLogin(code, {
      url: flags.url,
      clientId: flags.clientId,
      label: flags.label,
      write: flags.print ? false : undefined,
    });
    if (flags.print) {
      process.stdout.write(`${out.api_key}\n`);
    } else {
      const backupClause = out.backupPath ? ` (backup ${out.backupPath})` : "";
      process.stdout.write(
        `Logged in as tenant ${out.tenant}. Wrote FALDA_MCP_URL/FALDA_TOKEN/FALDA_TENANT to ${out.settingsPath}${backupClause}. Start a new Claude Code session.\n`,
      );
      // Groups by NAME (and role). The UUID is what /falda-memory:pool
      // writes, and is printed there; here the point is only to show the
      // user which shared memories this login can reach.
      if (out.groups.length) {
        process.stdout.write(`Groups you can share memory with: ${out.groups.map((g) => `${g.name} (${g.role})`).join(", ")}. Run /falda-memory:pool to bind this project to one.\n`);
      } else if (out.groups_status === "no_consent") {
        process.stdout.write("FALDA could not read your Globus groups — run /falda-memory:login again and accept the Groups consent to share memory with a group.\n");
      }
    }
    return;
  }

  throw new Error("usage: login.mjs start [--url ...] [--client-id ...] [--scope ...] | login.mjs finish <code> [--url ...] [--client-id ...] [--label ...] [--print]");
}

main().catch((err) => {
  process.stderr.write(`${err?.message ?? String(err)}\n`);
  process.exitCode = 1;
});
