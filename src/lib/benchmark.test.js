import { describe, it, expect, beforeEach } from 'vitest'
import {
  STORAGE_KEY,
  clearScores,
  conditionColor,
  conditionLabel,
  loadScores,
  mcpSkipped,
  median,
  normalizeRun,
  parseScoresJsonl,
  saveScores,
  sortRuns,
  summarize,
} from './benchmark'

const RUN = {
  timestamp: '2026-08-04T16:36:22.4077849-04:00',
  session_id: 'bf48e3f8',
  app: 'recipe',
  question_id: 'table-count',
  condition: 'with',
  run_index: 2,
  used_mcp_tool: true,
  cost_usd: 0.2894966,
  expected_count: 6,
  found_count: 6,
  matched_count: 6,
  accuracy: 1.0,
  noise_rate: 0.0,
  exact_match: true,
}

describe('normalizeRun', () => {
  it('maps scores.jsonl fields to the dashboard model', () => {
    const run = normalizeRun(RUN, 0)
    expect(run.condition).toBe('with')
    expect(run.usedMcp).toBe(true)
    expect(run.cost).toBeCloseTo(0.2894966)
    expect(run.exactMatch).toBe(true)
    expect(run.ms).toBe(Date.parse(RUN.timestamp))
  })

  it('survives a run stripped of all its fields', () => {
    const run = normalizeRun({}, 3)
    expect(run.cost).toBe(0)
    expect(run.accuracy).toBe(0)
    expect(run.usedMcp).toBe(false)
    expect(run.ms).toBeNull()
    expect(run.condition).toBe('unknown')
  })

  it('clamps accuracy and noise to [0,1] even if the logger misbehaves', () => {
    const run = normalizeRun({ ...RUN, accuracy: 1.4, noise_rate: -0.2 }, 0)
    expect(run.accuracy).toBe(1)
    expect(run.noise).toBe(0)
  })

  it("only treats a strict boolean as 'MCP called'", () => {
    expect(normalizeRun({ used_mcp_tool: 'true' }, 0).usedMcp).toBe(false)
    expect(normalizeRun({ used_mcp_tool: 1 }, 0).usedMcp).toBe(false)
  })
})

describe('parseScoresJsonl', () => {
  it('reads one JSON object per line', () => {
    const text = `${JSON.stringify(RUN)}\n${JSON.stringify({ ...RUN, session_id: 'b' })}`
    const { runs, skipped } = parseScoresJsonl(text)
    expect(runs).toHaveLength(2)
    expect(skipped).toBe(0)
  })

  it('ignores blank lines without counting them as errors', () => {
    const { runs, skipped } = parseScoresJsonl(`\n${JSON.stringify(RUN)}\n\n  \n`)
    expect(runs).toHaveLength(1)
    expect(skipped).toBe(0)
  })

  it('skips a truncated line and keeps the rest', () => {
    const text = `${JSON.stringify(RUN)}\n{"timestamp": "2026-08-\n${JSON.stringify(RUN)}`
    const { runs, skipped } = parseScoresJsonl(text)
    expect(runs).toHaveLength(2)
    expect(skipped).toBe(1)
  })

  it('rejects lines that are not objects', () => {
    const { runs, skipped } = parseScoresJsonl('42\n"text"\n[1,2]')
    expect(runs).toHaveLength(0)
    expect(skipped).toBe(3)
  })

  it('returns a chronologically sorted list', () => {
    const text = [
      JSON.stringify({ ...RUN, timestamp: '2026-08-05T14:06:40-04:00' }),
      JSON.stringify({ ...RUN, timestamp: '2026-08-04T15:45:48-04:00' }),
    ].join('\n')
    const { runs } = parseScoresJsonl(text)
    expect(runs[0].timestamp).toContain('2026-08-04')
  })

  it('does not throw on an empty input', () => {
    expect(parseScoresJsonl('')).toEqual({ runs: [], skipped: 0 })
    expect(parseScoresJsonl(null)).toEqual({ runs: [], skipped: 0 })
  })
})

describe('sortRuns', () => {
  it('sends runs with no usable timestamp to the end of the list', () => {
    const sorted = sortRuns([
      { ms: null, id: 'x' },
      { ms: 200, id: 'b' },
      { ms: 100, id: 'a' },
    ])
    expect(sorted.map((r) => r.id)).toEqual(['a', 'b', 'x'])
  })
})

describe('median', () => {
  it('takes the middle value on an odd count', () => {
    expect(median([3, 1, 2])).toBe(2)
  })
  it('averages the two middle values on an even count', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5)
  })
  it('returns 0 on an empty list rather than NaN', () => {
    expect(median([])).toBe(0)
  })
})

describe('summarize', () => {
  // Split by ACTUAL MCP usage: that's the whole point of the benchmark — two
  // `with` runs in scores.jsonl never called the MCP.
  const runs = [
    normalizeRun({ ...RUN, condition: 'with', used_mcp_tool: true, cost_usd: 0.3, exact_match: true }, 0),
    normalizeRun({ ...RUN, condition: 'with', used_mcp_tool: false, cost_usd: 2.0, exact_match: false, noise_rate: 0.5 }, 1),
    normalizeRun({ ...RUN, condition: 'without', used_mcp_tool: false, cost_usd: 1.0, exact_match: false, noise_rate: 0.5 }, 2),
  ]

  it('splits by used_mcp_tool, not by the displayed condition', () => {
    const s = summarize(runs)
    expect(s.withMcp.runs).toBe(1)
    expect(s.withoutMcp.runs).toBe(2)
    expect(s.withMcp.exact).toBe(1)
    expect(s.withoutMcp.exact).toBe(0)
  })

  it('computes the median cost ratio', () => {
    expect(summarize(runs).costRatio).toBeCloseTo(1.5 / 0.3)
  })

  it('returns null rather than infinity when a group is empty', () => {
    expect(summarize([runs[0]]).costRatio).toBeNull()
    expect(summarize([]).costRatio).toBeNull()
  })
})

describe('mcpSkipped', () => {
  it('flags a run where the MCP was allowed and not called', () => {
    expect(mcpSkipped(normalizeRun({ condition: 'with', used_mcp_tool: false }, 0))).toBe(true)
  })

  it('does not flag a run with no MCP at all: not calling it is not a choice there', () => {
    expect(mcpSkipped(normalizeRun({ condition: 'without', used_mcp_tool: false }, 0))).toBe(false)
  })

  it('does not flag a run where the MCP was actually called', () => {
    expect(mcpSkipped(normalizeRun({ condition: 'with-forced', used_mcp_tool: true }, 0))).toBe(false)
  })

  it('flags a forced run that still did not call the MCP — an anomaly worth seeing', () => {
    expect(mcpSkipped(normalizeRun({ condition: 'with-forced', used_mcp_tool: false }, 0))).toBe(true)
  })
})

describe('labels and colors', () => {
  it('names the three protocol conditions', () => {
    expect(conditionLabel('without')).toBe('No MCP')
    expect(conditionLabel('with-forced')).toBe('MCP forced')
  })
  it('falls back to a neutral shade for an unknown condition', () => {
    expect(conditionColor('with-something-new')).toBe('#7d6f99')
  })
})

describe('local persistence', () => {
  beforeEach(() => {
    globalThis.localStorage.clear()
  })

  it('reads back the dropped raw text', () => {
    saveScores('{"a":1}', 'scores.jsonl')
    expect(loadScores()).toEqual({ text: '{"a":1}', fileName: 'scores.jsonl' })
  })

  it('returns null when nothing has been stored', () => {
    expect(loadScores()).toBeNull()
  })

  it('returns null on a corrupted cache instead of throwing', () => {
    globalThis.localStorage.setItem(STORAGE_KEY, 'not json')
    expect(loadScores()).toBeNull()
  })

  it('clears the cache', () => {
    saveScores('{"a":1}', 'scores.jsonl')
    clearScores()
    expect(loadScores()).toBeNull()
  })
})
