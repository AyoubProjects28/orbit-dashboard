// Express backend for the Orbit dashboard — orchestrateur multi-provider.
// - GET  /api/metrics    : snapshot dashboard (mock.js)
// - GET  /api/vm-metrics : agents psutil (LLM + MCP), métriques infra
// - GET  /api/providers  : liste des cibles LLM (Ollama local / EC2 / Claude / Lambda)
// - POST /api/chat       : { message, provider, session_id, session_name } -> dispatch
//   vers le bon provider (chaque provider gère son propre tool-calling avec le MCP et
//   renvoie turnMetrics), journalise le tour et renvoie turn_id
// - POST /api/turns/:id/sampling : carottage CPU/RAM posté par le front après coup
// - GET  /api/logs       : sessions + tours fusionnés, antéchronologique
import { randomUUID } from 'crypto'
import express from 'express'
import { getMockMetrics, recordChatTurn } from './mock.js'
import * as mcpClient from './mcpClient.js'
import * as providers from './providers.js'
import * as sessionLog from './sessionLog.js'
import { onCall, offCall } from './callEvents.js'
const app = express()
const PORT = 3001
app.use(express.json())

app.get('/api/metrics', (req, res) => {
  res.json(getMockMetrics())
})

app.get('/api/providers', async (req, res) => {
  try {
    res.json({ providers: await providers.listProviders() })
  } catch (e) {
    res.status(502).json({ error: e.message, providers: [] })
  }
})

app.post('/api/chat', async (req, res) => {
  const { message, provider, session_id: sessionId, session_name: sessionName } = req.body ?? {}
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' })
  }
  try {
    const { reply, turnMetrics } = await providers.dispatch(provider, {
      message,
      tools: mcpClient.getTools(),
      callTool: mcpClient.callTool,
    })
    recordChatTurn({
      promptTokens: turnMetrics.prompt_tokens,
      completionTokens: turnMetrics.completion_tokens,
      latencyMs: turnMetrics.latency_ms,
      llmLatencyMs: turnMetrics.llm_latency_ms,
      overheadMs: turnMetrics.overhead_ms,
      llmCalls: turnMetrics.llm_calls,
      costUsd: turnMetrics.cost_usd,
    })

    const turnId = `t_${randomUUID()}`
    // `route` reste "llm-full" en dur jusqu'à l'étape 4 (rebranchement de
    // meta-tool.js dans le dispatch) — voir spec §5.1.
    sessionLog.appendTurn({
      id: turnId,
      ts: new Date().toISOString(),
      session_id: sessionId || 'default',
      session_name: sessionName || 'Session',
      provider: provider || null,
      provider_kind: turnMetrics.provider_kind ?? null,
      prompt: message,
      reply,
      route: 'llm-full',
      tools_called: [],
      metrics: turnMetrics,
    })

    res.json({ reply, turnMetrics, turn_id: turnId })
  } catch (err) {
    console.error('[chat] error:', err.message)
    res.status(502).json({ error: err.message || 'Failed to answer' })
  }
})

app.post('/api/turns/:id/sampling', (req, res) => {
  const { window_s: windowS, vms } = req.body ?? {}
  if (typeof windowS !== 'number' || !vms) {
    return res.status(400).json({ error: 'window_s and vms are required' })
  }
  sessionLog.appendSampling(req.params.id, { window_s: windowS, vms })
  res.status(204).end()
})

app.get('/api/logs', (req, res) => {
  res.json({ sessions: sessionLog.readLogs() })
})

// GET /api/call-events — flux SSE des appels LLM/MCP en direct (voir callEvents.js).
app.get('/api/call-events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  res.flushHeaders?.()

  const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`)
  onCall(send)

  // Un commentaire SSE toutes les 20 s pour garder la connexion vivante à
  // travers les proxys (nginx, le proxy dev de Vite) qui coupent une
  // connexion HTTP silencieuse au bout de ~30-60 s.
  const keepAlive = setInterval(() => res.write(': ping\n\n'), 20000)

  req.on('close', () => {
    clearInterval(keepAlive)
    offCall(send)
  })
})

// GET /api/vm-metrics — proxifie les agents psutil (côté serveur, même origine pour le navigateur)
const VM_AGENTS = {
  llm: 'http://172.18.53.7:9100/metrics',
  mcp: 'http://172.18.53.9:9100/metrics',
}
app.get('/api/vm-metrics', async (req, res) => {
  const out = {}
  await Promise.all(Object.entries(VM_AGENTS).map(async ([key, url]) => {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(2000) })
      out[key] = r.ok ? await r.json() : { error: `HTTP ${r.status}` }
    } catch (e) {
      out[key] = { error: e.message }
    }
  }))
  res.json(out)
})

async function start() {
  await mcpClient.init()
  app.listen(PORT, () => {
    console.log(`Orbit backend listening on http://localhost:${PORT}`)
  })
}
start().catch((err) => {
  console.error('Failed to start backend:', err.message)
  process.exit(1)
})
