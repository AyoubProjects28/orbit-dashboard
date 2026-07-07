// STUB — mock chat client.
//
// Once the Ollama VM address/model are confirmed, this file's real version
// will POST to Ollama's /api/chat endpoint and read its actual eval_count /
// prompt_eval_count / duration fields instead of estimating them below.
// The route in index.js won't need to change — same { reply, turnMetrics }
// return shape either way.

const COST_PER_TOKEN_USD = 0.000005 // placeholder rate, pending real pricing

const MOCK_REPLIES = [
  "Here's what I found based on the current metrics.",
  'The GPU load looks normal for this time of day.',
  "That completed successfully — check the dashboard for the latest numbers.",
  'Based on recent activity, everything is within expected ranges.',
]

function estimateTokens(text) {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words * 1.3))
}

function pickReply() {
  return MOCK_REPLIES[Math.floor(Math.random() * MOCK_REPLIES.length)]
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function getMockChatReply(message) {
  const start = Date.now()
  await wait(300 + Math.random() * 600) // simulate a real network round-trip

  const reply = pickReply()
  const promptTokens = estimateTokens(message)
  const completionTokens = estimateTokens(reply)
  const costUsd = (promptTokens + completionTokens) * COST_PER_TOKEN_USD

  return {
    reply,
    turnMetrics: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
      latency_ms: Date.now() - start,
      cost_usd: Number(costUsd.toFixed(6)),
    },
  }
}
