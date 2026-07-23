// Express backend for the Orbit dashboard — orchestrateur multi-provider.
// - GET  /api/metrics    : snapshot dashboard (mock.js)
// - GET  /api/vm-metrics : agents psutil (LLM + MCP), métriques infra
// - GET  /api/providers  : liste des cibles LLM (Ollama local / EC2 / Claude / Lambda)
// - POST /api/chat       : { message, provider } -> dispatch vers le bon provider
//   (chaque provider gère son propre tool-calling avec le MCP et renvoie turnMetrics)
import express from 'express'
import { getMockMetrics, recordChatTurn } from './mock.js'
import * as mcpClient from './mcpClient.js'
import * as providers from './providers.js'
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
  const { message, provider } = req.body ?? {}
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
    res.json({ reply, turnMetrics })
  } catch (err) {
    console.error('[chat] error:', err.message)
    res.status(502).json({ error: err.message || 'Failed to answer' })
  }
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
