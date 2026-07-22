// Express backend for the Orbit dashboard.
// - GET  /api/metrics    : dashboard snapshot (mock.js)
// - GET  /api/vm-metrics : proxies the psutil agents (LLM + MCP), same origin
// - GET  /api/models     : list of Ollama models (dashboard model picker)
// - POST /api/chat       : meta-tool.js picks WHICH tool(s) are relevant to
//   the message — never the arguments. index.js then either (a) executes a
//   deterministic call itself with a fixed argument (zero LLM calls), or
//   (b) restricts the LLM tool-calling loop to just those tools so the LLM
//   only has to fill in the argument. If meta-tool.js can't classify the
//   message at all, the full LLM tool-calling loop runs with every cached
//   tool — the Backend never parses natural language to pick an action
//   itself; it either matches a known intent or defers entirely to the LLM.
import express from 'express'
import { getMockMetrics, recordChatTurn } from './mock.js'
import * as mcpClient from './mcpClient.js'
import { chat } from './chatClient.js'
import { selectTools, formatDeterministicReply } from './meta-tool.js'
const app = express()
const PORT = 3001
const MAX_TOOL_HOPS = 4
app.use(express.json())

app.get('/api/metrics', (req, res) => {
  res.json(getMockMetrics())
})

async function runToolCallingLoop(message, model, tools) {
  const requestStartTime = Date.now()
  const messages = [{ role: 'user', content: message }]

  const totals = { promptTokens: 0, completionTokens: 0, llmLatencyMs: 0, costUsd: 0 }
  let finalReply = ''
  let llmCalls = 0

  for (let hop = 0; hop < MAX_TOOL_HOPS; hop++) {
    const { message: assistantMessage, turnMetrics } = await chat(messages, tools, model)
    llmCalls += 1

    totals.promptTokens += turnMetrics.prompt_tokens
    totals.completionTokens += turnMetrics.completion_tokens
    totals.llmLatencyMs += turnMetrics.latency_ms
    totals.costUsd += turnMetrics.cost_usd
    // Add the assistant's message to the conversation history
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

  const totalLatencyMs = Date.now() - requestStartTime
  const overheadMs = Math.max(0, totalLatencyMs - totals.llmLatencyMs)

  return {
    reply: finalReply,
    turnMetrics: {
      prompt_tokens: totals.promptTokens,
      completion_tokens: totals.completionTokens,
      total_tokens: totals.promptTokens + totals.completionTokens,
      latency_ms: totalLatencyMs,
      llm_latency_ms: totals.llmLatencyMs,
      overhead_ms: overheadMs,
      llm_calls: llmCalls,
      cost_usd: Number(totals.costUsd.toFixed(6)),
    },
  }
}

async function runDeterministic(decision) {
  const requestStartTime = Date.now()
  let docs = []
  try {
    const result = await mcpClient.callToolJson(decision.tool, decision.args)
    docs = Array.isArray(result.documents) ? result.documents : []
  } catch (err) {
    console.error(`[chat] ${decision.tool} failed:`, err.message)
  }
  const reply = formatDeterministicReply(decision.flags, docs)
  const totalLatencyMs = Date.now() - requestStartTime

  return {
    reply,
    turnMetrics: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      latency_ms: totalLatencyMs,
      llm_latency_ms: 0,
      overhead_ms: totalLatencyMs,
      llm_calls: 0,
      cost_usd: 0,
    },
  }
}

app.post('/api/chat', async (req, res) => {
  const { message, model } = req.body ?? {}
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' })
  }
  try {
    const allTools = mcpClient.getTools()
    const decision = selectTools(message, allTools)

    let reply, turnMetrics
    if (!decision.resolved) {
      ;({ reply, turnMetrics } = await runToolCallingLoop(message, model, allTools))
    } else if (decision.mode === 'deterministic') {
      ;({ reply, turnMetrics } = await runDeterministic(decision))
    } else {
      const restrictedTools = allTools.filter((tool) => decision.tools.includes(tool.name))
      ;({ reply, turnMetrics } = await runToolCallingLoop(message, model, restrictedTools))
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
    res.json({ reply, turnMetrics })
  } catch (err) {
    console.error('[chat] error:', err.message)
    res.status(502).json({ error: 'Failed to answer' })
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

app.get('/api/models', async (req, res) => {
  try {
    const LLM_URL = process.env.ORBIT_LLM_URL || 'http://172.18.53.7:11434'
    const r = await fetch(`${LLM_URL}/api/tags`, { signal: AbortSignal.timeout(3000) })
    const data = await r.json()
    res.json({ models: (data.models || []).map((m) => m.name).sort() })
  } catch (e) {
    res.status(502).json({ error: e.message, models: [] })
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



