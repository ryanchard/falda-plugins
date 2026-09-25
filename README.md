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

### 1. Get a token

Ask Ryan for a FALDA token. You get two things:

- a **token** (48 hex characters) — treat it like a password;
- your **tenant name** (usually your first name, e.g. `alice`).

Your tenant is your identity: everything you capture lands in your own
store, and only your token can read it. Sharing memory with a group is done
with *pools* that an admin creates and adds you to; you don't need one to
start.

### 2. Install the Claude Code plugin

From a Claude Code session, once per machine:

```
/plugin marketplace add ryanchard/falda-plugins
/plugin install falda-memory@falda
```

### 3. Point it at the hosted service

Add these to the `env` block of your **user-level** settings,
`~/.claude/settings.json` (create the block if it isn't there):

```json
{
  "env": {
    "FALDA_MCP_URL": "https://falda.cairnscore.ai/mcp",
    "FALDA_TOKEN": "<your token>",
    "FALDA_TENANT": "<your tenant name>"
  }
}
```

User-level is right for the hosted service: the tenant is *you*, not a
project, so every project on your machine captures into your one store.
Start a new session so the MCP connection picks the values up. If you would
rather keep the token out of `~/.claude/settings.json`, put `FALDA_TOKEN` in
`~/.claude/settings.local.json`; the two files are merged.

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
| `403 token is not authorized for tenant "x"` | `FALDA_TENANT` doesn't match the tenant on your token (exact match, lowercase). |
| Recall returns another person's memories | You are using a shared token. Get your own. |
| Nothing is ever recalled | Distillation runs in the background every few minutes; new sessions see new facts after the next pass. `/falda-memory:distill` forces one. |
| The hosted service is down | https://falda.cairnscore.ai/healthz; the plugin fails open (your agent keeps working, memory is just off). |

## Developing

The plugins are developed and tested in the FALDA source tree
(`integrations/<tool>/`) and published here with `git subtree`. Do not edit
them here; changes land via the FALDA repository's publish script.
