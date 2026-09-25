# FALDA plugins

Long-term memory for coding agents. [FALDA](https://github.com/rbross-hpc/falda)
captures what you and your agent say, distills it into durable facts,
preferences, and episodes, and feeds the relevant ones back into new
sessions. This repository holds the client-side plugins:

| Tool | Directory | Status |
|---|---|---|
| Claude Code | [`claude-code/`](claude-code/) | ready — install below |
| OpenCode | [`opencode/`](opencode/) | ready — see its README |
| Pi and others | — | planned |

The plugins talk to a FALDA server over MCP. You can run your own
(`docs/INSTALL.md` in the FALDA repository) or use the hosted instance below.

## Using the hosted FALDA

### 1. Install the Claude Code plugin

From a Claude Code session, once per machine:

```
/plugin marketplace add ryanchard/falda-plugins
/plugin install falda-memory@falda
```

### 2. Sign in with Globus

In a new session:

```
/falda-memory:login
```

It prints a Globus link. Open it, sign in, and accept the consent (FALDA
and "view my groups"). Globus shows you a code; paste it back:

```
/falda-memory:login <code>
```

That creates your FALDA account on first sign-in, writes your API key and
tenant into `~/.claude/settings.json` (a backup of the file is kept next to
it), and prints the Globus groups you belong to. Start a new session and
you're done. Your tenant is your identity: everything you capture lands in
your own store, and only your key can read it. Nothing to ask anyone for.

### 3. (Optional) Share memory with a group

A shared memory pool *is* a Globus group. Join the group in Globus, then in
the project you want bound to it:

```
/falda-memory:pool              # lists the groups you're in
/falda-memory:pool <group name> # binds this project to that group
```

That writes `FALDA_POOL=<group uuid>` into the project's
`.claude/settings.json`. From then on, sessions in that project capture into
the group's pool instead of your private store, and any active member of the
group sees the same memory. Recall in a bound project searches the pool
(searching your private store alongside it is coming next). Membership is
checked by the server against Globus and refreshed hourly; if you leave the
group, access ends at the next refresh. `/falda-memory:pool --clear` unbinds.
`/falda-memory:status` shows which group a project is bound to.

Manual configuration (self-hosters, or if you prefer env vars): the plugin
reads `FALDA_MCP_URL`, `FALDA_TOKEN`, `FALDA_TENANT`, and optionally
`FALDA_POOL`, from the `env` block of `~/.claude/settings.json` (user-level)
or a project's `.claude/settings.json`.

### 4. Check it works

In a new session run `/falda-memory:status`. It should print your tenant
and that the server is reachable. Say something worth remembering and, in a
later session, `/falda-memory:recall <topic>`.

What you get automatically:

| When | What happens |
|---|---|
| Every prompt you send, and every reply | Captured to your store (the raw "stream"). |
| First prompt of a session | Relevant memories are injected as context. |
| Before Claude Code compacts the conversation | A distillation pass is requested; after compaction, relevant memory is re-injected. |
| Every few minutes on the server | Distillation turns new turns into facts, preferences, and episodes, and refreshes your "core" summary. |

Slash commands: `/falda-memory:recall` (deliberate, bigger search),
`/falda-memory:remember` (save something now), `/falda-memory:distill`
(force a pass), `/falda-memory:status`. The model also has the `falda_*`
tools and uses them on its own when it needs memory.

### 5. Control what is captured

All switches are env vars in the same `env` block; `"0"` turns one off.

| Var | Default | Effect |
|---|---|---|
| `FALDA_CAPTURE` | on | Capture your prompts and the replies. |
| `FALDA_AUTO_RECALL` | on | Inject memory on the first prompt of a session. |
| `FALDA_DISTILL_ON_COMPACT` / `FALDA_RECALL_ON_COMPACT` | on | The compaction hooks. |
| `FALDA_CAPTURE_TOOLS` | **off** | Also capture tool results (file contents, command output). Set `"1"` to enable; this captures a lot more, including code. |

To pause FALDA in one project, set `FALDA_CAPTURE=0` in that project's
`.claude/settings.json`. To never use it somewhere, unset `FALDA_TOKEN`
there (the plugin becomes a no-op). Full flag reference:
[`claude-code/README.md`](claude-code/README.md).

### OpenCode

The OpenCode plugin uses the same three variables. Install steps and
behaviour: [`opencode/README.md`](opencode/README.md).

## What the server sees and keeps

- Your turns (and tool results if enabled), the facts distilled from them,
  and recall traces (which memories were returned when). Stored in Postgres
  on AWS, one schema per tenant.
- Embeddings and distillation run on the ALCF inference service (Argonne);
  your text is sent there for those calls and is not retained by it.
- Server logs record request metadata (tenant, token label, counts,
  timings) but never message content or tokens.
- There is no self-service delete yet; ask Ryan to remove your store.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `/falda-memory:status` says not configured | `FALDA_TOKEN` or `FALDA_TENANT` missing where Claude Code was started. Check `~/.claude/settings.json`; start a new session. |
| `401` from the MCP server | Wrong or revoked token. |
| `403 token is not authorized for tenant "x"` | `FALDA_TENANT` doesn't match the tenant on your key. Run `/falda-memory:login` again. |
| `403 not_a_member` in a bound project | You're not an active member of that group (or the UUID is wrong). Join the group in Globus, or `/falda-memory:pool --clear`. |
| `403 membership_stale` | The server hasn't been able to refresh your memberships for a week. Run `/falda-memory:login` again. |
| Recall returns another person's memories | Either the project is bound to a group (that's the point) or you're using someone else's key. Run `/falda-memory:login`. |
| Nothing is ever recalled | Distillation runs in the background every few minutes; new sessions see new facts after the next pass. `/falda-memory:distill` forces one. |
| The hosted service is down | https://falda.cairnscore.ai/healthz; the plugin fails open (your agent keeps working, memory is just off). |

## Developing

The plugins are developed and tested in the FALDA source tree
(`integrations/<tool>/`) and published here with `git subtree`. Do not edit
them here; changes land via the FALDA repository's publish script.
