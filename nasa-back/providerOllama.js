// Provider Ollama (local LLM-TEST01 OU instance EC2 GPU) — même API, URL différente.
// Gère la boucle de tool-calling au format Ollama et renvoie des métriques INFRA.
import axios from 'axios'
const ns2ms = (v) => (typeof v === 'number' ? Math.round(v / 1e6) : 0)
const MAX_HOPS = 4

export async function run({ message, tools = [], callTool, baseUrl, model }) {
  const t0 = Date.now()
  const ollamaTools = tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description ?? '', parameters: t.inputSchema ?? { type: 'object', properties: {} } },
  }))
  const messages = [{ role: 'user', content: message }]
  let reply = '', calls = 0, pTok = 0, cTok = 0, load = 0, pe = 0, gen = 0
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const r = await axios.post(`${baseUrl}/api/chat`, { model, messages, tools: ollamaTools, stream: false }, { timeout: 120000 })
    calls++
    const d = r.data
    pTok += d.prompt_eval_count || 0; cTok += d.eval_count || 0
    load += ns2ms(d.load_duration); pe += ns2ms(d.prompt_eval_duration); gen += ns2ms(d.eval_duration)
    const am = d.message
    messages.push(am)
    if (!am.tool_calls?.length) { reply = am.content; break }
    for (const tc of am.tool_calls) {
      const out = await callTool(tc.function.name, tc.function.arguments)
      messages.push({ role: 'tool', content: JSON.stringify(out.content ?? out) })
    }
  }
  const total = Date.now() - t0
  const llm = load + pe + gen
  return {
    reply,
    turnMetrics: {
      provider_kind: 'infra',
      prompt_tokens: pTok, completion_tokens: cTok, total_tokens: pTok + cTok,
      latency_ms: total, llm_latency_ms: llm, overhead_ms: Math.max(0, total - llm),
      load_ms: load, prompt_eval_ms: pe, gen_ms: gen,
      llm_calls: calls, cost_usd: Number(((pTok + cTok) * 0.000005).toFixed(6)),
    },
  }
}
