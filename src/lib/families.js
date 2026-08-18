// Grouping and aggregation for the Families sub-tab (SPEC_families.md §7).
//
// Pure module: no React, no network. Input is the /api/families payload
// ({ families, assignments, expectations, grades, turns }, already replayed
// by the backend — see nasa-back/index.js's GET /api/families). Everything
// here operates on that payload plus the "runs" it derives from it.
//
// Decision 6: a turn is in the benchmark IFF it belongs to a family — there
// is no separate "benchmarkable" flag. buildRuns() enforces that by only
// ever returning turns that have a live (non-deleted) assignment; everything
// else is the Unassigned inbox's concern (unassignedTurns()), which never
// goes through grouping/aggregation at all (decision 7: no aggregates there).

export const CONDITIONS = ['no-mcp', 'authorized', 'forced']

export const CONDITION_LABELS = {
  'no-mcp': 'No MCP',
  authorized: 'MCP allowed',
  forced: 'MCP forced',
}

function toNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function average(values) {
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

export function median(values) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// --- Turns -> runs -----------------------------------------------------------

// One run = one turn that belongs to a (non-deleted) family, decorated with
// everything grouping/aggregation needs. `condition`/`usedMcp` come from the
// backend's read-time derivation (turnDerive.js) — usedMcp is tri-state
// (true/false/null), never coerced to a plain boolean, so "unknown" can
// never be misread as "skipped" (see mcpSkipped below).
export function buildRuns(payload) {
  const { turns = [], assignments = [], grades = [] } = payload ?? {}
  const familyIdByTurn = new Map(assignments.map((a) => [a.turn_id, a.family_id]))
  const gradeByTurn = new Map(grades.map((g) => [g.turn_id, g]))

  return turns
    .filter((turn) => familyIdByTurn.has(turn.id))
    .map((turn) => {
      const grade = gradeByTurn.get(turn.id) ?? null
      return {
        turnId: turn.id,
        familyId: familyIdByTurn.get(turn.id),
        promptKey: turn.prompt_key,
        prompt: turn.prompt,
        sessionId: turn.session_id,
        provider: turn.provider,
        ts: turn.ts,
        condition: turn.condition,
        conditionInferred: turn.inferred === true,
        usedMcp: turn.used_mcp_tool ?? null,
        cost: toNumber(turn.metrics?.cost_usd),
        latencyMs: toNumber(turn.metrics?.latency_ms),
        totalTokens: toNumber(turn.metrics?.total_tokens),
        graded: grade !== null,
        expectedCount: grade?.expected_count ?? null,
        matchedCount: grade?.matched_count ?? null,
        foundCount: grade?.found_count ?? null,
      }
    })
}

// The inbox's data source — turns with no live assignment. Never aggregated
// (decision 7: "Unassigned" has no meaningful average).
export function unassignedTurns(payload) {
  const { turns = [], assignments = [] } = payload ?? {}
  const assignedIds = new Set(assignments.map((a) => a.turn_id))
  return turns.filter((turn) => !assignedIds.has(turn.id))
}

// --- The aggregation contract (SPEC §7) -------------------------------------

const KEY_OF = {
  prompt: (r) => r.promptKey,
  session: (r) => r.sessionId,
  family: (r) => r.familyId,
}

// Group by one level, then split by condition — prompt/session/family
// bubbles are the same code path with a different key function (decision:
// "do not write three charts").
export function groupRuns(level, runs) {
  const keyFn = KEY_OF[level]
  if (!keyFn) throw new Error(`groupRuns: unknown level "${level}"`)

  const groups = new Map()
  for (const run of runs) {
    const key = keyFn(run)
    if (key == null) continue // e.g. a turn with no session_id — nothing to group it under
    if (!groups.has(key)) {
      groups.set(key, { key, byCondition: Object.fromEntries(CONDITIONS.map((c) => [c, []])) })
    }
    const bucket = groups.get(key).byCondition[run.condition]
    // A run whose condition isn't one of the 3 known values is dropped
    // silently rather than thrown — malformed data shouldn't crash the tab.
    if (bucket) bucket.push(run)
  }
  return [...groups.values()]
}

// decision 3: "the MCP was available and the agent chose not to call it."
// Strictly `=== false` — an unknown usedMcp (turns that predate call-pins
// instrumentation) must never be drawn as a skip. Absence of evidence isn't
// evidence of absence.
export function mcpSkipped(run) {
  return run.condition !== 'no-mcp' && run.usedMcp === false
}

function stat(values) {
  if (values.length === 0) return { median: 0, min: 0, max: 0, avg: 0 }
  return { median: median(values), min: Math.min(...values), max: Math.max(...values), avg: average(values) }
}

// accuracy = matched/expected (recall). null when not computable (no grade,
// or a malformed grade with expected_count 0) — never 0, so it can never be
// mistaken for a real "found nothing" result.
function runAccuracy(run) {
  if (!run.graded || !run.expectedCount) return null
  return run.matchedCount / run.expectedCount
}

// noise = extra/found (1 - precision). found_count 0 means nothing was
// found, so nothing could have been invented either — 0, not "unknown".
function runNoise(run) {
  if (!run.graded) return null
  if (!run.foundCount) return 0
  return (run.foundCount - run.matchedCount) / run.foundCount
}

// n, cost/latency/tokens stats, accuracy/noise (ungraded runs excluded, never
// counted as wrong — SPEC §6), graded n/m, mcpSkipped count, mixed-provider
// flag (SPEC §7 — cost math differs per provider, mixing would be silent).
export function aggregate(runs) {
  const gradedRuns = runs.filter((r) => r.graded)
  const accuracyValues = gradedRuns.map(runAccuracy).filter((v) => v !== null)
  const noiseValues = gradedRuns.map(runNoise).filter((v) => v !== null)
  const providers = new Set(runs.map((r) => r.provider).filter(Boolean))

  return {
    n: runs.length,
    cost: stat(runs.map((r) => r.cost)),
    latency: stat(runs.map((r) => r.latencyMs)),
    tokens: stat(runs.map((r) => r.totalTokens)),
    accuracy: accuracyValues.length ? average(accuracyValues) : null,
    noise: noiseValues.length ? average(noiseValues) : null,
    graded: { n: gradedRuns.length, total: runs.length },
    skipped: runs.filter(mcpSkipped).length,
    mixedProvider: providers.size > 1,
  }
}

// --- Prompt completeness & the family rollup --------------------------------

// A prompt exists under all 3 conditions or it doesn't — badged `n/3
// conditions` and excluded from the family aggregate either way (SPEC §7).
// `forced` is never produced by the backend yet (SPEC §10), so today this is
// never `complete` — that's expected, not a bug: see aggregateFamily's
// "not comparable" fallback and acceptance criterion 4.
export function promptCompleteness(promptGroup) {
  const conditionsPresent = CONDITIONS.filter((c) => promptGroup.byCondition[c].length > 0)
  return {
    conditionsPresent,
    n: conditionsPresent.length,
    total: CONDITIONS.length,
    complete: conditionsPresent.length === CONDITIONS.length,
  }
}

// Prompt -> Family: median of the per-prompt values (SPEC §2), computed only
// over complete prompts. `comparable: false` when none are — never a delta
// computed on partial data (acceptance criterion 4).
export function aggregateFamily(promptGroups) {
  const complete = promptGroups.filter((pg) => promptCompleteness(pg).complete)
  if (complete.length === 0) {
    return { comparable: false, completePrompts: 0, totalPrompts: promptGroups.length, byCondition: null }
  }

  const byCondition = {}
  for (const condition of CONDITIONS) {
    const runsForCondition = complete.flatMap((pg) => pg.byCondition[condition])
    const perPromptAgg = complete.map((pg) => aggregate(pg.byCondition[condition]))
    const accuracies = perPromptAgg.map((a) => a.accuracy).filter((v) => v !== null)
    const noises = perPromptAgg.map((a) => a.noise).filter((v) => v !== null)
    const providers = new Set(runsForCondition.map((r) => r.provider).filter(Boolean))

    byCondition[condition] = {
      cost: median(perPromptAgg.map((a) => a.cost.median)),
      accuracy: accuracies.length ? average(accuracies) : null,
      noise: noises.length ? average(noises) : null,
      graded: {
        n: perPromptAgg.reduce((sum, a) => sum + a.graded.n, 0),
        total: perPromptAgg.reduce((sum, a) => sum + a.graded.total, 0),
      },
      mixedProvider: providers.size > 1,
    }
  }

  return { comparable: true, completePrompts: complete.length, totalPrompts: promptGroups.length, byCondition }
}
