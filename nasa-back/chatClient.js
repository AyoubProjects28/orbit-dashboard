// Client du LLM — ne parle qu'à Ollama, jamais au MCP.
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
    {
      model: model || MODEL,
      messages,
      tools: toOllamaTools(mcpTools),
      stream: false,
    },
    { timeout: 120000 }
  )
  const { message, prompt_eval_count, eval_count } = response.data
  const promptTokens = prompt_eval_count ?? 0
  const completionTokens = eval_count ?? 0
  const costUsd = (promptTokens + completionTokens) * 0.000005
  return {
    message,
    turnMetrics: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
      latency_ms: Date.now() - startTime,
      cost_usd: Number(costUsd.toFixed(6)),
    },
  }
}
