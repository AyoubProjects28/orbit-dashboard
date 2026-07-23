// Provider AWS Lambda — appelle une Function URL / API Gateway qui fait l'inférence
// (ex. Lambda -> Bedrock). Contrat attendu : POST {message} -> {reply, input_tokens?, output_tokens?, cost_usd?, billed_ms?}
import axios from 'axios'

export async function run({ message, url }) {
  if (!url) throw new Error('ORBIT_LAMBDA_URL manquante')
  const t0 = Date.now()
  const r = await axios.post(url, { message }, { timeout: 60000 })
  const d = r.data || {}
  const total = Date.now() - t0
  const inTok = d.input_tokens || d.prompt_tokens || 0
  const outTok = d.output_tokens || d.completion_tokens || 0
  return {
    reply: d.reply ?? d.response ?? (typeof d === 'string' ? d : JSON.stringify(d)),
    turnMetrics: {
      provider_kind: 'tokens',
      prompt_tokens: inTok, completion_tokens: outTok, total_tokens: inTok + outTok,
      latency_ms: total, llm_latency_ms: d.billed_ms || total, overhead_ms: 0,
      load_ms: 0, prompt_eval_ms: 0, gen_ms: 0,
      llm_calls: 1, cost_usd: Number((d.cost_usd || 0).toFixed ? Number(d.cost_usd || 0).toFixed(6) : 0),
    },
  }
}
