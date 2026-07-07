// Thin Express backend for the Orbit dashboard.
// - GET /api/metrics: current dashboard snapshot (mock for now, see mock.js).
// - POST /api/chat: relays a chat message (mock for now, see chatClient.js)
//   and records its stats into the shared metrics state.
// Later, mock.js/chatClient.js get swapped for real MCP/Ollama calls —
// the frontend contract (these two routes' shapes) stays the same.

import express from 'express'
import { getMockMetrics, recordChatTurn } from './mock.js'
import { getMockChatReply } from './chatClient.js'

const app = express()
const PORT = 3001

app.use(express.json())

app.get('/api/metrics', (req, res) => {
  res.json(getMockMetrics())
})

app.post('/api/chat', async (req, res) => {
  const { message } = req.body ?? {}
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' })
  }

  try {
    const { reply, turnMetrics } = await getMockChatReply(message)
    recordChatTurn({
      promptTokens: turnMetrics.prompt_tokens,
      completionTokens: turnMetrics.completion_tokens,
      latencyMs: turnMetrics.latency_ms,
      costUsd: turnMetrics.cost_usd,
    })
    res.json({ reply, turnMetrics })
  } catch {
    res.status(502).json({ error: 'Failed to reach the model' })
  }
})

app.listen(PORT, () => {
  console.log(`Orbit backend listening on http://localhost:${PORT}`)
})
