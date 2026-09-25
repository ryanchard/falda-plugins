---
description: Show which FALDA tenant this project addresses, and whether the server is reachable
---

Report the state of this project's FALDA connection:

1. Call the `falda_whoami` MCP tool and report the resolved tenant.
2. Fetch `/healthz` on the FALDA server (the host and port of
   `FALDA_MCP_URL`, path `/healthz` — it is unauthenticated) and report
   whether the endpoint is up.
3. Report whether this project is bound to a group pool. If `FALDA_POOL`
   is unset or empty, say memory is private to this tenant. If it is set,
   report the **group's name** (and the UUID) by running exactly this with
   Bash — it prints one line, the name, and nothing else:

   ```bash
   B="${FALDA_MCP_URL:-http://localhost:8079/mcp}"; B="${B%/}"; B="${B%/mcp}"; \
   curl -sS -X POST "$B/pools/mine" -H "Authorization: Bearer $FALDA_TOKEN" \
     -H "X-Falda-Tenant: $FALDA_TENANT" -H 'content-type: application/json' -d '{}' \
   | node -e 'let b="";process.stdin.on("data",d=>b+=d).on("end",()=>{let j={};try{j=JSON.parse(b)}catch{};const p=(j.pools||[]).find(x=>x.id===process.env.FALDA_POOL);console.log(p?p.name:"(bound to "+process.env.FALDA_POOL+", which is not in your groups — run /falda-memory:login again)")})'
   ```

   Write the command exactly as above: `$FALDA_TOKEN` must stay
   unexpanded in the command text (the shell expands it, the transcript
   must not), and the output is the group name only — never the response
   body, never the header.

4. Report the values of `FALDA_MCP_URL`, `FALDA_TENANT` and `FALDA_POOL` from the
   environment. **Never print `FALDA_TOKEN`.** Read and echo only these three
   variables individually (e.g. one command per variable, or a command that
   names exactly these three). **Never run `env`, `printenv`, or any other
   unfiltered environment dump** — even piped through `grep FALDA`, that
   family of command still prints `FALDA_TOKEN` to the transcript. Once a
   secret is in the transcript, the capture hook writes it to T0 like any
   other assistant/user text, and a later distillation pass could promote it
   into a durable memory — this is the one command whose output must stay
   scoped to exactly the named, non-secret variables.

If `falda_whoami` fails, the most common causes are a server that is not
running, or `FALDA_TOKEN`/`FALDA_TENANT` unset — in which case the capture
and recall hooks are silently doing nothing. Say which of those it looks
like.
