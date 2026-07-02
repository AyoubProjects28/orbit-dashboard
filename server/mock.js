// Generates mock metrics matching the /api/metrics schema (see PLAN §5).
// No real hardware, network, or MCP calls happen here — every value is
// randomized around a realistic baseline so the dashboard has something
// to show before the real MCP (mcp-test01) is wired in.

const SERIES_LENGTH = 10; // number of points per time series
const SERIES_STEP_MS = 60 * 1000; // 1 minute between points

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

// Builds a short time series ending "now", with values wobbling around `base`.
function buildSeries(now, base, spread, decimals = 0) {
  const points = [];
  for (let i = SERIES_LENGTH - 1; i >= 0; i--) {
    const t = new Date(now.getTime() - i * SERIES_STEP_MS).toISOString();
    const value = Number(randomBetween(base - spread, base + spread).toFixed(decimals));
    points.push([t, value]);
  }
  return points;
}

export function getMockMetrics() {
  const now = new Date();

  const latencyMs = Math.round(randomBetween(30, 90));
  const costPerRequest = Number(randomBetween(0.0012, 0.0035).toFixed(4));
  const promptTokens = Math.round(randomBetween(800, 1600));
  const completionTokens = Math.round(randomBetween(200, 500));

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
      latency_ms: latencyMs,
      throughput_rps: Number(randomBetween(4, 12).toFixed(1)),
    },
    tokens: {
      prompt: promptTokens,
      completion: completionTokens,
      total: promptTokens + completionTokens,
    },
    cost: {
      per_request_usd: costPerRequest,
      total_usd: Number(randomBetween(1, 6).toFixed(2)),
      currency: 'USD',
    },
    series: {
      latency_ms: buildSeries(now, latencyMs, 15, 0),
      cost_per_request_usd: buildSeries(now, costPerRequest, 0.0008, 4),
    },
  };
}
