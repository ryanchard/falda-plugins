---
description: Sign in to FALDA with Globus and store your API key (no argument: get the link; with a code: finish)
---

If no argument was given, run `node "${CLAUDE_PLUGIN_ROOT}/hooks/login.mjs" start` with Bash and show the user the printed link verbatim, telling them: sign in with Globus, copy the code it displays, and run `/falda-memory:login <code>`.

If an argument was given, run `node "${CLAUDE_PLUGIN_ROOT}/hooks/login.mjs" finish <argument>` and relay its output. On success tell the user to start a new Claude Code session so the MCP connection picks up the key. Never print `FALDA_TOKEN` or the settings file contents.
