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

Otherwise run
`node "${CLAUDE_PLUGIN_ROOT}/hooks/pool.mjs" '<argument>'` with Bash —
single-quote the argument in the command so shell metacharacters it might
contain are never interpreted — and relay its output. The argument may be a
group name or a group UUID; an ambiguous name fails with the candidates
listed, and the user should re-run with the UUID.

On success tell the user to start a new Claude Code session, so both the
hooks and the MCP connection pick up the binding. Never print `FALDA_TOKEN`
or the contents of the settings file.
