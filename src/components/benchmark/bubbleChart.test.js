import { describe, it, expect } from 'vitest'
import {
  GEOM,
  RADIUS,
  batchBoundaries,
  bubbleRadius,
  formatClock,
  formatCost,
  formatDay,
  plotHeight,
  plotWidth,
  rankX,
  valueY,
} from './bubbleChart'

describe('bubbleRadius', () => {
  it('grows the AREA proportionally to cost, not the radius', () => {
    // A run 4x more expensive should have a radius 2x larger once the
    // minimum offset is removed — otherwise it looks 16x bigger to the eye.
    const base = bubbleRadius(0)
    expect((bubbleRadius(4) - base) / (bubbleRadius(1) - base)).toBeCloseTo(2)
  })

  it('stays bounded on an outlier cost', () => {
    expect(bubbleRadius(10000)).toBeLessThanOrEqual(30)
  })

  it('falls back to the minimum radius for a missing or negative cost', () => {
    expect(bubbleRadius(undefined)).toBe(7)
    expect(bubbleRadius(-3)).toBe(7)
  })
})

describe('frame margins', () => {
  // Regression: with padTop = 20, the no-MCP run at $1.89 (100% accuracy,
  // 21px radius) was clipped at the top of the viewBox. A bubble is centered
  // on its value, so each margin must absorb a full maximum radius.
  it('absorbs a maximum-radius bubble on every edge', () => {
    expect(GEOM.padTop).toBeGreaterThanOrEqual(RADIUS.max)
    expect(GEOM.padBottom).toBeGreaterThanOrEqual(RADIUS.max)
    expect(GEOM.padLeft + GEOM.edgeInset).toBeGreaterThanOrEqual(RADIUS.max)
    expect(GEOM.padRight + GEOM.edgeInset).toBeGreaterThanOrEqual(RADIUS.max)
  })
})

describe('rankX', () => {
  it('centers the single bubble when there is only one run', () => {
    expect(rankX(0, 1)).toBeCloseTo(GEOM.padLeft + plotWidth() / 2)
  })

  it('spaces runs evenly, margins included', () => {
    const first = rankX(0, 4)
    const last = rankX(3, 4)
    expect(first).toBeCloseTo(GEOM.padLeft + GEOM.edgeInset)
    expect(last).toBeCloseTo(GEOM.padLeft + plotWidth() - GEOM.edgeInset)
    expect(rankX(1, 4) - first).toBeCloseTo(rankX(2, 4) - rankX(1, 4))
  })

  it('keeps the extreme bubbles inside the frame', () => {
    expect(rankX(0, 16)).toBeGreaterThan(GEOM.padLeft)
    expect(rankX(15, 16)).toBeLessThan(GEOM.padLeft + plotWidth())
  })
})

describe('valueY', () => {
  it('places 100% at the top by default', () => {
    expect(valueY(1)).toBeCloseTo(GEOM.padTop)
    expect(valueY(0)).toBeCloseTo(GEOM.padTop + plotHeight())
  })

  it('inverts the axis for noise, so "higher = better" stays true', () => {
    expect(valueY(0, true)).toBeCloseTo(GEOM.padTop)
    expect(valueY(1, true)).toBeCloseTo(GEOM.padTop + plotHeight())
  })

  it('clamps out-of-range values instead of drawing outside the frame', () => {
    expect(valueY(2)).toBeCloseTo(GEOM.padTop)
    expect(valueY(-1)).toBeCloseTo(GEOM.padTop + plotHeight())
    expect(valueY(NaN)).toBeCloseTo(GEOM.padTop + plotHeight())
  })
})

describe('batchBoundaries', () => {
  it('spots day changes', () => {
    const runs = [
      { timestamp: '2026-08-04T15:45:48-04:00' },
      { timestamp: '2026-08-04T16:37:44-04:00' },
      { timestamp: '2026-08-05T13:47:44-04:00' },
    ]
    expect(batchBoundaries(runs)).toEqual([2])
  })

  it('does not cut a continuous day', () => {
    const runs = [
      { timestamp: '2026-08-04T15:45:48-04:00' },
      { timestamp: '2026-08-04T16:37:44-04:00' },
    ]
    expect(batchBoundaries(runs)).toEqual([])
  })

  it('does not throw on a missing timestamp', () => {
    expect(batchBoundaries([{ timestamp: null }, { timestamp: null }])).toEqual([])
  })
})

describe('formatting', () => {
  it('shows more decimals on tiny costs', () => {
    expect(formatCost(1.55)).toBe('$1.55')
    expect(formatCost(0.0025)).toBe('$0.0025')
  })
  it('extracts clock and day without depending on the browser timezone', () => {
    expect(formatClock('2026-08-04T16:36:22.407-04:00')).toBe('4:36pm')
    expect(formatDay('2026-08-04T16:36:22.407-04:00')).toBe('04/08')
  })
  it('renders the 12-hour clock edge cases: midnight and noon', () => {
    expect(formatClock('2026-08-04T00:05:00-04:00')).toBe('12:05am')
    expect(formatClock('2026-08-04T12:00:00-04:00')).toBe('12:00pm')
  })
  it('keeps a single-digit hour unpadded, minutes always two digits', () => {
    expect(formatClock('2026-08-04T09:05:00-04:00')).toBe('9:05am')
  })
  it('renders a dash on an unreadable timestamp', () => {
    expect(formatClock(null)).toBe('—')
    expect(formatDay('2026')).toBe('—')
  })
})
