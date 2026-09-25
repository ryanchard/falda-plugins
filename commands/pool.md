---
description: Share this project's FALDA memory with a Globus group (no argument: list your groups; with a name or UUID: bind this project)
---

The argument, if any, is: $ARGUMENTS

A FALDA pool **is** a Globus group: while a project is bound to one, this
project's sessions capture into the group's shared memory and recall from it
alongside your private memory. Membership is managed entirely in Globus
(app.globus.org/groups).

If no argument was given, run `node "${CLAUDE_PLUGIN_ROOT}/hooks/pool.mjs"`
with Bash and relay its output — the groups you can use, as `name — uuid`.

If the argument is exactly `--clear`, run
`node "${CLAUDE_PLUGIN_ROOT}/hooks/pool.mjs" --clear` and relay its output.

If the argument is exactly `--current`, run
`node "${CLAUDE_PLUGIN_ROOT}/hooks/pool.mjs" --current` and relay the one
line it prints.

Otherwise the argument is a group name or a group UUID. Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/hooks/pool.mjs" --name '<argument>'
```

**Quote it exactly like that.** Wrap the argument in single quotes and, if
it contains a single quote of its own, replace each one with `'\''` (end
the quoted run, an escaped quote, start a new quoted run) — a group name is
user-supplied text and must never reach the shell unquoted, where
backticks, `$`, `;` or `&&` in it would be interpreted. `--name` takes the
whole value verbatim, so spaces need no other handling.

Relay the output. An ambiguous name fails with the candidates listed, and
the user should re-run with the UUID.

On success tell the user to start a new Claude Code session, so both the
hooks and the MCP connection pick up the binding. Never print `FALDA_TOKEN`
or the contents of the settings file.
