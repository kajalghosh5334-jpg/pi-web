# Pi Multi-Agent Backend

Fork of [pi-mono](https://github.com/earendil-works/pi) with a **Multi-Agent orchestration layer** for the Pi Web.app frontend.

## What this adds

- **Multi-Agent runtime** (`monitor-server.js`) — Guardian → Lead → Sub-Agent DAG execution
- **Agent profiles** (`agent-profiles.json`) — long-term agent roles, skills, and collaboration protocols
- **Lead agent policy** (`lead-agent.md`) — planning rules, model routing, review policy
- **Sub-agent defaults** (`sub-agent-defaults.md`) — execution standards for all sub-agents
- **Agent memory** (`agent_memory/`) — cross-session context, progress, and bug tracking

## Architecture

See [`../MULTI_AGENT_SYSTEM.md`](../MULTI_AGENT_SYSTEM.md) for the full system map.

Quick overview:
```
User → pi-frontend (Next.js) → /api/orchestrate → monitor-server.js (Express + WebSocket)
                                    │
                          ┌─────────┼─────────┐
                     Guardian      Lead     Sub-Agents (DAG)
```

## Prerequisites

- **Node.js** >= 22.19.0
- **pi CLI** installed and on PATH (`/usr/local/bin/pi` by default, configurable via `PI_BIN_PATH`)
- **LLM API access** — configured via pi's `~/.pi/agent/auth.json` (OpenCode-Go, DeepSeek, etc.)
- **pi-frontend** running (for WebSocket orchestration; see `../pi-frontend/`)

## Quick Start

```bash
# Install dependencies
npm install --ignore-scripts

# Start the Multi-Agent backend
node monitor-server.js
```

The server starts on port 3000 (configurable via `PI_MONITOR_PORT`).

## Configuration

| Env Variable | Default | Description |
|---|---|---|
| `PI_MONITOR_PORT` | `3000` | HTTP + WebSocket port |
| `PI_BIN_PATH` | `/usr/local/bin/pi` | Path to pi CLI |
| `PI_MULTI_AGENT_SKILL_ROOT` | `./skills/` | Skills directory |
| `PI_MULTI_AGENT_MEMORY_ROOT` | `./agent_memory/` | Agent memory directory |
| `PI_FRONTEND_ROOT` | `../pi-frontend` | Path to frontend repo |

## Upstream

This is a fork of [earendil-works/pi](https://github.com/earendil-works/pi).  
The core packages (`packages/ai`, `packages/agent`, `packages/coding-agent`, `packages/tui`) are from upstream.
Multi-Agent additions are in the repo root and `packages/agent/src/`.

## License

MIT (same as upstream)
