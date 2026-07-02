# Pi Web — Frontend

Web UI for [pi](https://github.com/earendil-works/pi). Browse sessions, chat with the agent, fork conversations, and manage a Multi-Agent orchestration system.

## Features

- **Session browser** — browse all pi sessions grouped by working directory
- **Real-time chat** — SSE streaming interaction with the agent
- **Session fork** — create independent branches from any message
- **In-session branching** — navigate between conversation branches
- **Model switching** — change models mid-conversation
- **Tool panel** — control which tools the agent can use
- **Compaction** — summarize long sessions to save context window
- **Multi-Agent monitor** — Guardian / Lead / Sub-Agent orchestration panel (requires backend)
- **Workflow editor** — define and run multi-agent task DAGs

## Quick Start (npm)

```bash
npx @agegr/pi-web@latest
```

Opens at [http://127.0.0.1:30141](http://127.0.0.1:30141).

## Development

```bash
npm install
npm run dev   # port 30141
```

## Local Launcher

After `npm install`, Pi Web automatically creates a desktop launcher on macOS or Windows.

```bash
npm run app:install
```

Run this command to regenerate it. Clicking the launcher starts Pi Web locally and opens it as an app window. It supports Chrome and Quark Browser; use `PI_WEB_BROWSER=quark npm run app:install` to force Quark.

### With Multi-Agent Backend

For the full Multi-Agent system, also start the backend:

```bash
cd ../pi-backend
npm install --ignore-scripts
node monitor-server.js
```

Then the monitor panel is available in the sidebar (collaboration area) and at `/monitor`.

## Prerequisites

- **Node.js** >= 22
- **pi CLI** installed (for agent session management)
- **LLM API keys** configured in `~/.pi/agent/auth.json`
- **pi-backend** running if using Multi-Agent features (see `../pi-backend/`)

## Data

- Sessions: `~/.pi/agent/sessions/<encoded-cwd>/<timestamp>_<uuid>.jsonl`
- Model config: `~/.pi/agent/models.json`
- Override session dir: `PI_CODING_AGENT_DIR`

## Project Structure

```
app/
  api/
    sessions/          # session CRUD
    agent/             # send commands, SSE event stream
    orchestrate/       # Multi-Agent orchestration
    guardian/          # Guardian decide endpoint
    monitor/           # backend status proxy
    workflows/         # workflow CRUD
    models/            # model list + defaults
    models-config/     # read/write models.json
  monitor/             # standalone monitor page
components/
  AppShell.tsx         # main layout + Multi-Agent bridge
  ChatWindow.tsx       # messages + streaming
  monitor/             # Multi-Agent UI components
hooks/
  useOrchestrate.ts    # orchestration state management
lib/
  session-reader.ts    # parse .jsonl session files
  rpc-manager.ts       # AgentSession lifecycle
  types.ts
```

## Architecture

See [`../MULTI_AGENT_SYSTEM.md`](../MULTI_AGENT_SYSTEM.md) for the full Multi-Agent system map.
