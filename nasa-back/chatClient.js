// Client du LLM — ne parle qu'à Ollama, jamais au MCP.
// Envoie le prompt + la liste d'outils ; lit la réponse (texte ou tool_calls)
// et les compteurs de tokens + durées (chargement / prompt / génération).
import axios from 'axios'
const LLM_URL = process.env.ORBIT_LLM_URL || 'http://172.18.53.7:11434'
const MODEL = process.env.ORBIT_LLM_MODEL || 'qwen:7b'
function toOllamaTools(mcpTools) {
  return mcpTools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description ?? '',
      parameters: tool.inputSchema ?? { type: 'object', properties: {} },
    },
  }))
}
export async function chat(messages, mcpTools = [], model = MODEL) {
  const startTime = Date.now()
  const response = await axios.post(
    `${LLM_URL}/api/chat`,
    { model: model || MODEL, messages, tools: toOllamaTools(mcpTools), stream: false },
    { timeout: 120000 }
  )
  const d = response.data
  const promptTokens = d.prompt_eval_count ?? 0
  const completionTokens = d.eval_count ?? 0
  const ns2ms = (v) => (typeof v === 'number' ? Math.round(v / 1e6) : 0)
  const costUsd = (promptTokens + completionTokens) * 0.000005
  return {
    message: d.message,
    turnMetrics: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
      latency_ms: Date.now() - startTime,
      load_ms: ns2ms(d.load_duration),
      prompt_eval_ms: ns2ms(d.prompt_eval_duration),
      gen_ms: ns2ms(d.eval_duration),
      cost_usd: Number(costUsd.toFixed(6)),
    },
  }
}
