// Reading and aggregating MCP benchmark results (scores.jsonl).
//
// Pure module: no React import, no network access. The file isn't produced
// here — it comes from a colleague's machine, via a logger we don't control
// and whose schema will keep moving (tokens, turns, dev_verified have already
// been requested). Hence two deliberate choices:
//
//   1. Parsing NEVER THROWS on a bad line. A 200-run JSONL with 3 truncated
//      lines should show 197 bubbles, not an error screen. Rejected lines are
//      counted and surfaced to the UI.
//   2. Every field is read with a fallback. A run missing cost_usd renders
//      with the minimum bubble size instead of crashing the radius math.
//
// Vocabulary (see ARCHITECTURE §8): in scores.jsonl, `accuracy` is
// matched/expected — that's RECALL, "did it find the real tables". `noise_rate`
// is extra/found — that's 1 - PRECISION, "did it invent tables that don't
// exist". The two are independent: a run can find every real table and still
// be full of hallucinated ones.

export const CONDITIONS = ['without', 'with', 'with-forced']

export const CONDITION_LABELS = {
  without: 'No MCP',
  with: 'MCP allowed',
  'with-forced': 'MCP forced',
}

// Palette copied from src/index.css (--accent, --accent-3, --accent-2).
// Duplicated in hardcoded form as in infra/orbitChart.js: the SVG can't read
// CSS variables to compute a color, and tests should check stable color
// values rather than something resolved at runtime.
export const CONDITION_COLORS = {
  without: '#ff2e88',
  with: '#ffb63d',
  'with-forced': '#23e6d1',
}

const UNKNOWN_COLOR = '#7d6f99'

export function conditionColor(condition) {
  return CONDITION_COLORS[condition] ?? UNKNOWN_COLOR
}

export function conditionLabel(condition) {
  return CONDITION_LABELS[condition] ?? (condition || 'unknown')
}

// "The MCP was available and the agent chose not to call it."
//
// Deliberately false for the `without` condition: there, the agent had no
// choice — not calling the MCP isn't a decision. Marking those runs as
// "skipped" too would put 7 bubbles out of 16 in dashes and bury the one case
// that actually matters — the 2 `with` runs where the agent had the MCP
// within reach and chose to dig through the code instead, ending up 6x more
// expensive and wrong.
export function mcpSkipped(run) {
  return run.condition !== 'without' && !run.usedMcp
}

function toNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

// Clamped to [0,1]: accuracy and noise_rate are ratios, but nothing
// guarantees a third-party logger will never return 1.2 or -0. A point
// outside the chart's range would silently break the axis scale.
function toRatio(value) {
  const n = toNumber(value, 0)
  return Math.min(1, Math.max(0, n))
}

// An unreadable timestamp shouldn't make the run disappear: it's kept with
// ms = null, and sorting sends it to the end of the list (see sortRuns).
function toMillis(timestamp) {
  const ms = Date.parse(timestamp)
  return Number.isFinite(ms) ? ms : null
}

export function normalizeRun(raw, index) {
  return {
    // session_id is the natural identifier on the logger's side; the index
    // only exists to keep a stable React key if two runs share a session.
    id: `${raw?.session_id ?? 'run'}-${index}`,
    sessionId: raw?.session_id ?? null,
    timestamp: raw?.timestamp ?? null,
    ms: toMillis(raw?.timestamp),
    app: raw?.app ?? 'unknown',
    questionId: raw?.question_id ?? 'unknown',
    condition: raw?.condition ?? 'unknown',
    runIndex: toNumber(raw?.run_index, 0),
    // THE field that actually matters: condition says what was ALLOWED,
    // usedMcp says what the agent DID. Two `with` runs in scores.jsonl never
    // called the MCP and behave exactly like `without` runs.
    usedMcp: raw?.used_mcp_tool === true,
    cost: toNumber(raw?.cost_usd, 0),
    accuracy: toRatio(raw?.accuracy),
    noise: toRatio(raw?.noise_rate),
    exactMatch: raw?.exact_match === true,
    expectedCount: toNumber(raw?.expected_count, 0),
    foundCount: toNumber(raw?.found_count, 0),
    matchedCount: toNumber(raw?.matched_count, 0),
  }
}

// Chronological sort. Runs with no usable timestamp go to the end of the
// list rather than the start: otherwise they'd stick to the left edge of the
// chart, masquerading as the oldest runs.
export function sortRuns(runs) {
  return [...runs].sort((a, b) => {
    if (a.ms === null && b.ms === null) return 0
    if (a.ms === null) return 1
    if (b.ms === null) return -1
    return a.ms - b.ms
  })
}

export function parseScoresJsonl(text) {
  const lines = String(text ?? '').split(/\r?\n/)
  const runs = []
  let skipped = 0

  lines.forEach((line) => {
    const trimmed = line.trim()
    if (trimmed === '') return
    let raw
    try {
      raw = JSON.parse(trimmed)
    } catch {
      skipped += 1
      return
    }
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      skipped += 1
      return
    }
    runs.push(normalizeRun(raw, runs.length))
  })

  return { runs: sortRuns(runs), skipped }
}

export function median(values) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// Aggregated by ACTUAL MCP usage, not by displayed condition — that's the
// split that carries the result (see the comment on usedMcp).
export function summarize(runs) {
  const used = runs.filter((r) => r.usedMcp)
  const notUsed = runs.filter((r) => !r.usedMcp)
  const bucket = (rows) => ({
    runs: rows.length,
    medianCost: median(rows.map((r) => r.cost)),
    exact: rows.filter((r) => r.exactMatch).length,
    meanNoise: rows.length ? rows.reduce((a, r) => a + r.noise, 0) / rows.length : 0,
  })
  const withMcp = bucket(used)
  const withoutMcp = bucket(notUsed)
  return {
    total: runs.length,
    withMcp,
    withoutMcp,
    // null rather than Infinity when either group is empty or free: the UI
    // should be able to say "not comparable" instead of showing "∞x".
    costRatio: withMcp.medianCost > 0 && withoutMcp.medianCost > 0
      ? withoutMcp.medianCost / withMcp.medianCost
      : null,
  }
}

// --- Local persistence -------------------------------------------------------
//
// Product choice: the last dropped file replaces the previous one and
// survives a reload. During a demo, an accidental F5 shouldn't force
// re-dropping the jsonl in front of a client. We store the RAW TEXT, not the
// normalized runs: the day normalizeRun changes, an old cache stays readable.

export const STORAGE_KEY = 'orbit.benchmark.scores'

function storage() {
  try {
    return globalThis.localStorage ?? null
  } catch {
    // Some browsers throw on the mere read of localStorage in private
    // browsing or with third-party cookies blocked.
    return null
  }
}

export function saveScores(text, fileName) {
  const store = storage()
  if (!store) return false
  try {
    store.setItem(STORAGE_KEY, JSON.stringify({ text, fileName, savedAt: Date.now() }))
    return true
  } catch {
    // Quota exceeded: the tab stays usable for the current session.
    return false
  }
}

export function loadScores() {
  const store = storage()
  if (!store) return null
  try {
    const rawValue = store.getItem(STORAGE_KEY)
    if (!rawValue) return null
    const parsed = JSON.parse(rawValue)
    if (!parsed || typeof parsed.text !== 'string') return null
    return { text: parsed.text, fileName: parsed.fileName ?? null }
  } catch {
    return null
  }
}

export function clearScores() {
  const store = storage()
  if (!store) return
  try {
    store.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to do: the caller already clears its own React state.
  }
}
