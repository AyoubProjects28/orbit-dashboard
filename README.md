# Orbit Dashboard

Orbit Dashboard is a web app for monitoring an LLM-backed chatbot. You chat with a
language model, and a live dashboard shows the cost, latency, and token usage of
each message.

The project is two separate programs in one repo:

| Part | Folder | Role |
|------|--------|------|
| Frontend | [`src/`](src/) | React UI the user sees in the browser |
| Backend | [`nasa-back/`](nasa-back/) | Node/Express server that orchestrates the LLM and tool calls |

They communicate over HTTP. The frontend never talks to the LLM or the tool server
directly — it only ever calls its own backend.

## Architecture

```
[ Browser: React UI ]                 [ Node/Express backend ]        [ External services ]
   src/                                  nasa-back/
   ┌─────────────┐   fetch('/api/*')    ┌──────────────┐   HTTP      ┌──────────────┐
   │ ChatPanel   │ ───────────────────► │ index.js     │ ──────────► │ Ollama (LLM) │
   │ Latency/... │ ◄─────────────────── │ (orchestrator)│ ◄────────── │              │
   └─────────────┘      JSON             └──────┬───────┘             └──────────────┘
                                                │  MCP protocol       ┌──────────────┐
                                                └───────────────────► │ MCP server   │
                                                                      │ (tools)      │
                                                                      └──────────────┘
```

Two external services, both running on separate VMs:

- **Ollama** — runs the language model (open source to avoid cost) locally instead of calling a hosted
  provider.
- **MCP server** — exposes "tools" the model can call, using the Model Context Protocol
  (a standard way to give an LLM abilities like search or database lookups).

## Frontend (`src/`)

Built with **React 19** and **Vite** (dev server + build tool), charts via **Recharts**.

- [`src/main.jsx`](src/main.jsx) — mounts the React tree into `index.html`'s single
  `<div id="root">`. This is a single-page app; everything is rendered by JavaScript.
- [`src/App.jsx`](src/App.jsx) — the root component. Holds the `metrics` and `error`
  state, fetches metrics once on mount, then polls every 12 seconds. Renders
  `ChatPanel` alongside the metric panels.
- [`src/api/`](src/api/) — thin wrappers around `fetch`:
  - [`metrics.js`](src/api/metrics.js) — `GET /api/metrics`
  - [`chat.js`](src/api/chat.js) — `POST /api/chat`

  These call `/api/*` with no host or port. Vite's dev server proxies `/api/*` to
  `localhost:3001` (see [`vite.config.js`](vite.config.js)); nginx does the same in
  production. The API endpoint is only known in these two files.
- [`src/components/`](src/components/) — one file per panel, each a stateless
  component driven entirely by a `data` prop:
  - [`ChatPanel.jsx`](src/components/ChatPanel.jsx) — the chat UI. Owns its own
    message list, sends messages, and calls `onMessageSent()` after each reply so
    `App.jsx` knows to refresh the dashboard.
  - [`SummaryBar.jsx`](src/components/SummaryBar.jsx) — total cost and average
    cost per request.
  - [`LatencyPanel.jsx`](src/components/LatencyPanel.jsx),
    [`TokensPanel.jsx`](src/components/TokensPanel.jsx),
    [`CostPanel.jsx`](src/components/CostPanel.jsx) — charts and detail stats
    for each metric category.
  - [`HardwarePanel.jsx`](src/components/HardwarePanel.jsx) — GPU/CPU/RAM chart.
    **Currently disabled** in `App.jsx` because the hardware numbers are still
    mocked; kept in the tree for when real measurement lands.

## Backend (`nasa-back/`)

A **Node.js + Express** server that orchestrates the chat flow.

- [`index.js`](nasa-back/index.js) — the server and orchestrator. Exposes:
  - `GET /api/metrics` — returns the current metrics snapshot.
  - `POST /api/chat` — runs the tool-calling loop:
    1. Send the conversation plus the list of available tools to the LLM.
    2. If the LLM replies with plain text, that's the final answer.
    3. If the LLM asks to call tools, run each tool via `mcpClient.callTool()`,
       feed the results back into the conversation, and loop again.
    4. Capped at `MAX_TOOL_HOPS = 4` to prevent infinite loops.

    The LLM and the MCP server never talk to each other directly — this file is
    the only thing that routes tool calls between them. It also computes a
    latency breakdown: total wall-clock time minus pure LLM time gives the
    "overhead" (tool execution + orchestration) shown in the Latency panel.
- [`chatClient.js`](nasa-back/chatClient.js) — the only file that talks to the LLM.
  Sends the conversation and tool list to Ollama's `/api/chat`, reads back token
  counts, and computes cost. Configurable via `ORBIT_LLM_URL` / `ORBIT_LLM_MODEL`.
- [`mcpClient.js`](nasa-back/mcpClient.js) — the only file that speaks the MCP
  protocol. Connects and caches the tool list once at startup (`init()`); refuses
  to start without an `ORBIT_MCP_TOKEN`. `callTool()` runs a tool on demand.
- [`mock.js`](nasa-back/mock.js) — the in-memory metrics store (no database; resets
  on restart). Split into two halves:
  - **Hardware** metrics are fully mocked — re-randomized on every request to
    simulate fluctuating shared infrastructure.
  - **Latency, tokens, and cost** are event-driven and real — they only change
    when `recordChatTurn()` is called after an actual chat turn, accumulating
    totals and appending to a capped 20-point time series used by the charts.

  The file name and the `server` npm script predate this split — most of what it
  returns is now real, only hardware remains mocked.

## Running it

Two processes, in separate terminals:

```bash
npm run server   # Express backend on :3001 (nasa-back/index.js)
npm run dev      # Vite frontend dev server, proxies /api → :3001
```

The backend requires `ORBIT_MCP_TOKEN` to be set, and reachable Ollama/MCP hosts, or
it will refuse to start.

## Notes

- The `nasa-back` / `nasa-front` naming and the `outDir: 'nasa-front'` build setting
  in [`vite.config.js`](vite.config.js) exist only to match folder names on the
  deployment VM (`web-test01`) — "Orbit" is the actual product name.
- Root [`package.json`](package.json) and [`nasa-back/package.json`](nasa-back/package.json)
  are two independent Node projects sharing one repo.
- No TypeScript — plain JavaScript (`.js`/`.jsx`). `@types/react` is a dev-only aid
  for editor tooling.
