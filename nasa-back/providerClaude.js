// Provider Claude (API Anthropic Messages) — tool-calling natif (tool_use / tool_result).
// Convertit les tools MCP au format Anthropic et renvoie des métriques TOKENS.
import axios from 'axios'
const API = 'https://api.anthropic.com/v1/messages'
const MAX_HOPS = 5
// Tarifs indicatifs par token (à ajuster via env selon le modèle réel)
const PRICE_IN = Number(process.env.ANTHROPIC_PRICE_IN || 0.000003)
const PRICE_OUT = Number(process.env.ANTHROPIC_PRICE_OUT || 0.000015)

export async function run({ message, tools = [], callTool, apiKey, model }) {
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY manquante')
  const t0 = Date.now()
  const anthTools = tools.map((t) => ({
    name: t.name, description: t.description ?? '', input_schema: t.inputSchema ?? { type: 'object', properties: {} },
  }))
  const messages = [{ role: 'user', content: message }]
  let reply = '', calls = 0, inTok = 0, outTok = 0
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const r = await axios.post(API, { model, max_tokens: 1024, tools: anthTools, messages }, {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      timeout: 60000,
    })
    calls++
    const d = r.data
    inTok += d.usage?.input_tokens || 0; outTok += d.usage?.output_tokens || 0
    messages.push({ role: 'assistant', content: d.content })
    const toolUses = (d.content || []).filter((b) => b.type === 'tool_use')
    if (!toolUses.length) {
      reply = (d.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n')
      break
    }
    const results = []
    for (const tu of toolUses) {
      const out = await callTool(tu.name, tu.input)
      const text = typeof out === 'string' ? out : JSON.stringify(out.content ?? out)
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: text })
    }
    messages.push({ role: 'user', content: results })
  }
  const total = Date.now() - t0
  const cost = inTok * PRICE_IN + outTok * PRICE_OUT
  return {
    reply,
    turnMetrics: {
      provider_kind: 'tokens',
      prompt_tokens: inTok, completion_tokens: outTok, total_tokens: inTok + outTok,
      latency_ms: total, llm_latency_ms: total, overhead_ms: 0,
      load_ms: 0, prompt_eval_ms: 0, gen_ms: 0,
      llm_calls: calls, cost_usd: Number(cost.toFixed(6)),
    },
  }
}
