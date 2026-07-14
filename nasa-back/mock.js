// Mock metrics state (see PLAN §5 for the schema).
//
// Hardware (GPU/CPU/RAM) stays PASSIVE: randomized fresh on every call,
// simulating shared infrastructure that fluctuates on its own.
//
// Latency/tokens/cost are EVENT-DRIVEN: they only change when a chat turn
// happens (see recordChatTurn, called from the /api/chat route). This keeps
// the demo honest — those numbers move because you sent a message, not
// because of background noise.

const MAX_SERIES_POINTS = 20

const state = {
  totalCostUsd: 0,
  totalTokens: 0,
  totalLlmCalls: 0,
  lastPromptTokens: 0,
  lastCompletionTokens: 0,
  lastLatencyMs: 0,
  lastLlmLatencyMs: 0,
  lastOverheadMs: 0,
  lastLlmCalls: 0,
  lastCostPerRequestUsd: 0,
  latencySeries: [],
  costSeries: [],
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min)
}

export function recordChatTurn({
  promptTokens,
  completionTokens,
  latencyMs,
  llmLatencyMs = 0,
  overheadMs = 0,
  llmCalls = 0,
  costUsd,
}) {
  const now = new Date().toISOString()

  state.totalCostUsd += costUsd
  state.totalTokens += promptTokens + completionTokens
  state.totalLlmCalls += llmCalls
  state.lastPromptTokens = promptTokens
  state.lastCompletionTokens = completionTokens
  state.lastLatencyMs = latencyMs
  state.lastLlmLatencyMs = llmLatencyMs
  state.lastOverheadMs = overheadMs
  state.lastLlmCalls = llmCalls
  state.lastCostPerRequestUsd = costUsd

  state.latencySeries.push([now, latencyMs])
  state.costSeries.push([now, Number(costUsd.toFixed(6))])
  if (state.latencySeries.length > MAX_SERIES_POINTS) state.latencySeries.shift()
  if (state.costSeries.length > MAX_SERIES_POINTS) state.costSeries.shift()
}

export function getMockMetrics() {
  const now = new Date()

  return {
    timestamp: now.toISOString(),
    hardware: {
      gpu: [
        {
          id: 0,
          util_pct: Math.round(randomBetween(40, 95)),
          mem_used_mb: Math.round(randomBetween(6000, 12000)),
          mem_total_mb: 16000,
          temp_c: Math.round(randomBetween(55, 78)),
        },
      ],
      cpu_pct: Math.round(randomBetween(15, 60)),
      ram_used_mb: Math.round(randomBetween(9000, 20000)),
      ram_total_mb: 32000,
    },
    network: {
      latency_ms: state.lastLatencyMs,
      throughput_rps: Number(randomBetween(4, 12).toFixed(1)),
    },
    llm: {
      latency_ms: state.lastLlmLatencyMs,
      overhead_ms: state.lastOverheadMs,
      calls_last_turn: state.lastLlmCalls,
      calls_total: state.totalLlmCalls,
    },
    tokens: {
      prompt: state.lastPromptTokens,
      completion: state.lastCompletionTokens,
      total: state.totalTokens,
    },
    cost: {
      per_request_usd: state.lastCostPerRequestUsd,
      total_usd: Number(state.totalCostUsd.toFixed(4)),
      currency: 'USD',
    },
    series: {
      latency_ms: state.latencySeries,
      cost_per_request_usd: state.costSeries,
    },
  }
}
