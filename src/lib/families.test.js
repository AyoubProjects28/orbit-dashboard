import { describe, it, expect } from 'vitest'
import {
  CONDITIONS,
  aggregate,
  aggregateFamily,
  buildRuns,
  groupRuns,
  mcpSkipped,
  median,
  promptCompleteness,
  unassignedTurns,
} from './families'

function turn(overrides = {}) {
  return {
    id: 't1',
    prompt_key: 'sha1:a',
    prompt: 'How many files?',
    session_id: 's1',
    provider: 'ollama:qwen2.5:7b',
    ts: '2026-08-06T10:00:00.000Z',
    condition: 'authorized',
    inferred: false,
    used_mcp_tool: true,
    metrics: { cost_usd: 0.001, latency_ms: 1000, total_tokens: 500 },
    ...overrides,
  }
}

function payload({ turns = [], assignments = [], grades = [] } = {}) {
  return { turns, assignments, grades, families: [], expectations: [] }
}

describe('buildRuns', () => {
  it('only includes turns that have a live assignment', () => {
    const p = payload({
      turns: [turn({ id: 't1' }), turn({ id: 't2' })],
      assignments: [{ turn_id: 't1', family_id: 'fam_a' }],
    })
    const runs = buildRuns(p)
    expect(runs).toHaveLength(1)
    expect(runs[0].turnId).toBe('t1')
    expect(runs[0].familyId).toBe('fam_a')
  })

  it('marks a run ungraded when no grade line exists for it', () => {
    const p = payload({
      turns: [turn({ id: 't1' })],
      assignments: [{ turn_id: 't1', family_id: 'fam_a' }],
    })
    const [run] = buildRuns(p)
    expect(run.graded).toBe(false)
    expect(run.matchedCount).toBeNull()
  })

  it('attaches the matching grade when one exists', () => {
    const p = payload({
      turns: [turn({ id: 't1' })],
      assignments: [{ turn_id: 't1', family_id: 'fam_a' }],
      grades: [{ turn_id: 't1', expected_count: 1, matched_count: 1, found_count: 1 }],
    })
    const [run] = buildRuns(p)
    expect(run.graded).toBe(true)
    expect(run.matchedCount).toBe(1)
  })

  it('keeps usedMcp as a tri-state (true/false/null), never coerced to boolean', () => {
    const p = payload({
      turns: [turn({ id: 't1', used_mcp_tool: null })],
      assignments: [{ turn_id: 't1', family_id: 'fam_a' }],
    })
    expect(buildRuns(p)[0].usedMcp).toBeNull()
  })
})

describe('unassignedTurns', () => {
  it('is the exact complement of buildRuns', () => {
    const p = payload({
      turns: [turn({ id: 't1' }), turn({ id: 't2' })],
      assignments: [{ turn_id: 't1', family_id: 'fam_a' }],
    })
    const unassigned = unassignedTurns(p)
    expect(unassigned).toHaveLength(1)
    expect(unassigned[0].id).toBe('t2')
  })
})

describe('mcpSkipped', () => {
  it('is true when the MCP was authorized and known NOT to have been called', () => {
    expect(mcpSkipped({ condition: 'authorized', usedMcp: false })).toBe(true)
  })

  it('is false when usedMcp is unknown (null) — absence of evidence is not evidence of absence', () => {
    expect(mcpSkipped({ condition: 'authorized', usedMcp: null })).toBe(false)
  })

  it('is false under no-mcp — there was never a choice to skip', () => {
    expect(mcpSkipped({ condition: 'no-mcp', usedMcp: false })).toBe(false)
  })

  it('is false when the MCP was actually used', () => {
    expect(mcpSkipped({ condition: 'authorized', usedMcp: true })).toBe(false)
  })
})

describe('groupRuns', () => {
  const runs = buildRuns(payload({
    turns: [
      turn({ id: 't1', prompt_key: 'sha1:a', session_id: 's1', condition: 'no-mcp' }),
      turn({ id: 't2', prompt_key: 'sha1:a', session_id: 's1', condition: 'authorized' }),
      turn({ id: 't3', prompt_key: 'sha1:b', session_id: 's2', condition: 'authorized' }),
    ],
    assignments: [
      { turn_id: 't1', family_id: 'fam_a' },
      { turn_id: 't2', family_id: 'fam_a' },
      { turn_id: 't3', family_id: 'fam_a' },
    ],
  }))

  it('groups by prompt, splitting each group by condition', () => {
    const groups = groupRuns('prompt', runs)
    expect(groups).toHaveLength(2)
    const a = groups.find((g) => g.key === 'sha1:a')
    expect(a.byCondition['no-mcp']).toHaveLength(1)
    expect(a.byCondition.authorized).toHaveLength(1)
  })

  it('groups by session and by family too, from the exact same function', () => {
    const bySession = groupRuns('session', runs)
    const byFamily = groupRuns('family', runs)
    expect(bySession).toHaveLength(2)
    expect(byFamily).toHaveLength(1)
  })

  it('the three levels return consistent totals (acceptance criterion 5)', () => {
    const totalRunsIn = (groups) => groups.reduce(
      (sum, g) => sum + CONDITIONS.reduce((s, c) => s + g.byCondition[c].length, 0),
      0,
    )
    expect(totalRunsIn(groupRuns('prompt', runs))).toBe(runs.length)
    expect(totalRunsIn(groupRuns('session', runs))).toBe(runs.length)
    expect(totalRunsIn(groupRuns('family', runs))).toBe(runs.length)
  })

  it('throws on an unknown level rather than silently returning nothing', () => {
    expect(() => groupRuns('bogus', runs)).toThrow()
  })

  it('drops a run whose condition is not one of the 3 known values, without crashing', () => {
    const weird = buildRuns(payload({
      turns: [turn({ id: 't9', condition: 'something-else' })],
      assignments: [{ turn_id: 't9', family_id: 'fam_a' }],
    }))
    const groups = groupRuns('prompt', weird)
    expect(groups).toHaveLength(1)
    expect(CONDITIONS.reduce((s, c) => s + groups[0].byCondition[c].length, 0)).toBe(0)
  })
})

describe('aggregate', () => {
  it('computes n and cost median/min/max/avg', () => {
    const runs = buildRuns(payload({
      turns: [
        turn({ id: 't1', metrics: { cost_usd: 0.001, latency_ms: 100, total_tokens: 10 } }),
        turn({ id: 't2', metrics: { cost_usd: 0.003, latency_ms: 300, total_tokens: 30 } }),
        turn({ id: 't3', metrics: { cost_usd: 0.002, latency_ms: 200, total_tokens: 20 } }),
      ],
      assignments: [
        { turn_id: 't1', family_id: 'fam_a' },
        { turn_id: 't2', family_id: 'fam_a' },
        { turn_id: 't3', family_id: 'fam_a' },
      ],
    }))
    const agg = aggregate(runs)
    expect(agg.n).toBe(3)
    expect(agg.cost.median).toBeCloseTo(0.002)
    expect(agg.cost.min).toBeCloseTo(0.001)
    expect(agg.cost.max).toBeCloseTo(0.003)
    expect(agg.cost.avg).toBeCloseTo(0.002)
  })

  it('an ungraded run is excluded from accuracy/noise, never counted as wrong (the rule that must not be broken)', () => {
    const runs = buildRuns(payload({
      turns: [turn({ id: 't1' }), turn({ id: 't2' })],
      assignments: [
        { turn_id: 't1', family_id: 'fam_a' },
        { turn_id: 't2', family_id: 'fam_a' },
      ],
      // Only t1 is graded, and gets it wrong. If ungraded were treated as 0,
      // accuracy would read 0.5; it must read exactly 0 (t1 alone), with the
      // graded counter showing 1/2 — not silently 2/2.
      grades: [{ turn_id: 't1', expected_count: 1, matched_count: 0, found_count: 1 }],
    }))
    const agg = aggregate(runs)
    expect(agg.accuracy).toBe(0)
    expect(agg.graded).toEqual({ n: 1, total: 2 })
  })

  it('accuracy/noise are null (not 0) when nothing at all is graded', () => {
    const runs = buildRuns(payload({
      turns: [turn({ id: 't1' })],
      assignments: [{ turn_id: 't1', family_id: 'fam_a' }],
    }))
    const agg = aggregate(runs)
    expect(agg.accuracy).toBeNull()
    expect(agg.noise).toBeNull()
  })

  it('computes noise as (found - matched) / found', () => {
    const runs = buildRuns(payload({
      turns: [turn({ id: 't1' })],
      assignments: [{ turn_id: 't1', family_id: 'fam_a' }],
      grades: [{ turn_id: 't1', expected_count: 1, matched_count: 1, found_count: 4 }],
    }))
    expect(aggregate(runs).noise).toBeCloseTo(0.75)
  })

  it('counts mcpSkipped runs', () => {
    const runs = buildRuns(payload({
      turns: [
        turn({ id: 't1', condition: 'authorized', used_mcp_tool: false }),
        turn({ id: 't2', condition: 'authorized', used_mcp_tool: true }),
      ],
      assignments: [
        { turn_id: 't1', family_id: 'fam_a' },
        { turn_id: 't2', family_id: 'fam_a' },
      ],
    }))
    expect(aggregate(runs).skipped).toBe(1)
  })

  it('flags mixedProvider when runs come from more than one provider', () => {
    const runs = buildRuns(payload({
      turns: [
        turn({ id: 't1', provider: 'ollama:qwen2.5:7b' }),
        turn({ id: 't2', provider: 'claude' }),
      ],
      assignments: [
        { turn_id: 't1', family_id: 'fam_a' },
        { turn_id: 't2', family_id: 'fam_a' },
      ],
    }))
    expect(aggregate(runs).mixedProvider).toBe(true)
  })

  it('does not flag mixedProvider when every run shares a provider', () => {
    const runs = buildRuns(payload({
      turns: [turn({ id: 't1' }), turn({ id: 't2' })],
      assignments: [
        { turn_id: 't1', family_id: 'fam_a' },
        { turn_id: 't2', family_id: 'fam_a' },
      ],
    }))
    expect(aggregate(runs).mixedProvider).toBe(false)
  })
})

describe('promptCompleteness', () => {
  it('is complete only with a run under all 3 conditions', () => {
    const runs = buildRuns(payload({
      turns: [
        turn({ id: 't1', condition: 'no-mcp' }),
        turn({ id: 't2', condition: 'authorized' }),
        turn({ id: 't3', condition: 'forced' }),
      ],
      assignments: [
        { turn_id: 't1', family_id: 'fam_a' },
        { turn_id: 't2', family_id: 'fam_a' },
        { turn_id: 't3', family_id: 'fam_a' },
      ],
    }))
    const [group] = groupRuns('prompt', runs)
    const completeness = promptCompleteness(group)
    expect(completeness.complete).toBe(true)
    expect(completeness.n).toBe(3)
  })

  it('is incomplete (and badged n/3) with only 2 of 3 conditions — the case every real prompt is in today, since forced does not exist yet', () => {
    const runs = buildRuns(payload({
      turns: [
        turn({ id: 't1', condition: 'no-mcp' }),
        turn({ id: 't2', condition: 'authorized' }),
      ],
      assignments: [
        { turn_id: 't1', family_id: 'fam_a' },
        { turn_id: 't2', family_id: 'fam_a' },
      ],
    }))
    const [group] = groupRuns('prompt', runs)
    const completeness = promptCompleteness(group)
    expect(completeness.complete).toBe(false)
    expect(completeness.n).toBe(2)
    expect(completeness.total).toBe(3)
  })
})

describe('aggregateFamily', () => {
  it('is not comparable when no prompt is complete under all 3 conditions (acceptance criterion 4)', () => {
    const runs = buildRuns(payload({
      turns: [
        turn({ id: 't1', prompt_key: 'sha1:a', condition: 'no-mcp' }),
        turn({ id: 't2', prompt_key: 'sha1:a', condition: 'authorized' }),
      ],
      assignments: [
        { turn_id: 't1', family_id: 'fam_a' },
        { turn_id: 't2', family_id: 'fam_a' },
      ],
    }))
    const result = aggregateFamily(groupRuns('prompt', runs))
    expect(result.comparable).toBe(false)
    expect(result.byCondition).toBeNull()
  })

  it('rolls up the median of per-prompt costs, over complete prompts only', () => {
    const turnsFor = (promptKey, cost) => CONDITIONS.map((condition) => turn({
      id: `${promptKey}-${condition}`,
      prompt_key: promptKey,
      condition,
      metrics: { cost_usd: cost, latency_ms: 100, total_tokens: 10 },
    }))
    const complete1 = turnsFor('sha1:a', 0.001) // complete prompt, cost 0.001 on every condition
    const complete2 = turnsFor('sha1:b', 0.003) // complete prompt, cost 0.003 on every condition
    const incomplete = [turn({ id: 'incomplete-1', prompt_key: 'sha1:c', condition: 'no-mcp', metrics: { cost_usd: 999, latency_ms: 1, total_tokens: 1 } })]
    const allTurns = [...complete1, ...complete2, ...incomplete]
    const assignments = allTurns.map((t) => ({ turn_id: t.id, family_id: 'fam_a' }))

    const runs = buildRuns(payload({ turns: allTurns, assignments }))
    const result = aggregateFamily(groupRuns('prompt', runs))

    expect(result.comparable).toBe(true)
    expect(result.completePrompts).toBe(2)
    expect(result.totalPrompts).toBe(3)
    // median of [0.001, 0.003] = 0.002, and the incomplete prompt's 999 must
    // never leak into the rollup.
    expect(result.byCondition.authorized.cost).toBeCloseTo(0.002)
    expect(result.byCondition['no-mcp'].cost).toBeCloseTo(0.002)
  })
})

describe('median', () => {
  it('averages the two middle values for an even-length list', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5)
  })

  it('returns 0 for an empty list rather than NaN', () => {
    expect(median([])).toBe(0)
  })
})
