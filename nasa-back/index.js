// Express backend for the Orbit dashboard — the sole orchestrator.
// - GET /api/metrics: current dashboard snapshot (see mock.js).
// - POST /api/chat: at startup, does the MCP handshake (tools/list, cached);
//   per request, drives the chatClient <-> mcpClient loop — the LLM emits
//   structured tool_calls, this file looks them up by name and routes them
//   to mcpClient.callTool(). The LLM and the MCP never talk to each other.

import express from 'express'
import { getMockMetrics, recordChatTurn } from './mock.js'
import { chat } from './chatClient.js'
import * as mcpClient from './mcpClient.js'

const app = express()
const PORT = 3001
const MAX_TOOL_HOPS = 4

app.use(express.json())

app.get('/api/metrics', (req, res) => {
  res.json(getMockMetrics())
})

app.post('/api/chat', async (req, res) => {
  const { message, history } = req.body ?? {}
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' })
  }

  try {
    const requestStartTime = Date.now()
    const tools = mcpClient.getTools()
    const messages = [...(Array.isArray(history) ? history : []), { role: 'user', content: message }]

    const totals = { promptTokens: 0, completionTokens: 0, llmLatencyMs: 0, costUsd: 0 }
    let finalReply = ''
    let llmCalls = 0

    for (let hop = 0; hop < MAX_TOOL_HOPS; hop++) {
      const { message: assistantMessage, turnMetrics } = await chat(messages, tools)
      llmCalls += 1

      totals.promptTokens += turnMetrics.prompt_tokens
      totals.completionTokens += turnMetrics.completion_tokens
      totals.llmLatencyMs += turnMetrics.latency_ms
      totals.costUsd += turnMetrics.cost_usd

      messages.push(assistantMessage)

      if (!assistantMessage.tool_calls?.length) {
        finalReply = assistantMessage.content
        break
      }

      for (const toolCall of assistantMessage.tool_calls) {
        const { name, arguments: args } = toolCall.function
        const result = await mcpClient.callTool(name, args)
        messages.push({ role: 'tool', content: JSON.stringify(result.content ?? result) })
      }
    }

    // Wall-clock time for the whole turn, vs. the sum of pure LLM call time
    // above — the difference is MCP tool execution + backend orchestration.
    const totalLatencyMs = Date.now() - requestStartTime
    const overheadMs = Math.max(0, totalLatencyMs - totals.llmLatencyMs)

    const turnMetrics = {
      prompt_tokens: totals.promptTokens,
      completion_tokens: totals.completionTokens,
      total_tokens: totals.promptTokens + totals.completionTokens,
      latency_ms: totalLatencyMs,
      llm_latency_ms: totals.llmLatencyMs,
      overhead_ms: overheadMs,
      llm_calls: llmCalls,
      cost_usd: Number(totals.costUsd.toFixed(6)),
    }

    recordChatTurn({
      promptTokens: turnMetrics.prompt_tokens,
      completionTokens: turnMetrics.completion_tokens,
      latencyMs: turnMetrics.latency_ms,
      llmLatencyMs: turnMetrics.llm_latency_ms,
      overheadMs: turnMetrics.overhead_ms,
      llmCalls: turnMetrics.llm_calls,
      costUsd: turnMetrics.cost_usd,
    })

    res.json({ reply: finalReply, turnMetrics })
  } catch (err) {
    console.error('[chat] error:', err.message)
    res.status(502).json({ error: 'Failed to reach the model' })
  }
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
