// Geometry for the benchmark bubble chart.
//
// Pure module, same approach as infra/orbitChart.js: everything comes in
// through parameters, nothing reads the DOM or the clock, so positions are
// testable without mounting a component.

// Non-obvious constraint: a bubble is centered on its value, so a run at 100%
// accuracy has its center exactly on padTop and overflows the viewBox by its
// radius. With the real scores.jsonl, the no-MCP run at $1.89 (21px radius)
// was clipped at the top of the frame. Hence the invariant checked in tests:
// padTop and padBottom must each be at least RADIUS.max, and edgeInset plays
// the same role horizontally.
export const GEOM = {
  width: 780,
  height: 334,
  padLeft: 66,
  padRight: 26,
  padTop: 32,
  // padBottom houses the tilted clock label BELOW the largest possible
  // bubble: a bubble centered on value 0 extends RADIUS.max below the axis,
  // and the tilted label eats another dozen pixels going up.
  padBottom: 84,
  // Inner margin so the first and last bubble don't overflow the axes: at
  // the extreme rank, the center sits on the edge of the frame.
  edgeInset: 30,
}

export const plotWidth = (g = GEOM) => g.width - g.padLeft - g.padRight
export const plotHeight = (g = GEOM) => g.height - g.padTop - g.padBottom

// Radius proportional to the SQUARE ROOT of cost: it's the disc's AREA that
// should be proportional to the value, otherwise a run 2x more expensive
// looks 4x bigger. Classic misreading on bubble charts.
export const RADIUS = { min: 7, scale: 10.5, max: 30 }

export function bubbleRadius(cost, radius = RADIUS) {
  const safe = Number.isFinite(cost) && cost > 0 ? cost : 0
  return Math.min(radius.max, radius.min + Math.sqrt(safe) * radius.scale)
}

// X axis = chronological rank, not real time.
//
// Runs arrive in bursts: in scores.jsonl, 7 runs over 52 minutes, then 9 runs
// over 19 minutes, 21 hours apart. On a linear time axis, the two bursts take
// up 23px and 8px, the rest is empty, and 4 runs launched within 2 minutes
// overlap. One notch per run removes the collisions without losing anything:
// the exact time is still written under each notch and the batch separator
// marks the day boundaries.
export function rankX(index, total, g = GEOM) {
  const x0 = g.padLeft
  const usable = plotWidth(g) - g.edgeInset * 2
  if (total <= 1) return x0 + plotWidth(g) / 2
  return x0 + g.edgeInset + (index / (total - 1)) * usable
}

// invert = true puts 0 at the top. Used by the Noise sub-tab so "higher =
// better" stays true on both sub-tabs: switching between two visually
// identical charts whose axis points the opposite way is the surest way to
// get a result read backwards in a demo.
export function valueY(value, invert = false, g = GEOM) {
  const safe = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))
  const h = plotHeight(g)
  return invert ? g.padTop + safe * h : g.padTop + (1 - safe) * h
}

// Label offsets below the axis, measured from the bottom of the plot frame
// (see padBottom).
export const LABEL_OFFSET = { clock: 44, day: 64 }

export const GRID_LEVELS = [0, 0.25, 0.5, 0.75, 1]

// Ranks where the date changes: used to draw the dashed batch-separator line.
// Compares the local date (first 10 characters of the ISO string) rather than
// milliseconds, because the break that matters to the user is "these are two
// different test days", not "more than N hours elapsed".
export function batchBoundaries(runs) {
  const boundaries = []
  for (let i = 1; i < runs.length; i += 1) {
    const previous = runs[i - 1].timestamp?.slice(0, 10) ?? null
    const current = runs[i].timestamp?.slice(0, 10) ?? null
    if (previous !== current) boundaries.push(i)
  }
  return boundaries
}

export function formatCost(cost) {
  const safe = Number.isFinite(cost) ? cost : 0
  return safe < 0.01 ? `$${safe.toFixed(4)}` : `$${safe.toFixed(2)}`
}

// 12-hour clock with am/pm, built by slicing the ISO string rather than going
// through Date/toLocaleTimeString: the timestamps carry their own UTC offset
// (e.g. -04:00), and converting through Date would re-render them in the
// browser's local timezone instead of the offset they were logged with.
export function formatClock(timestamp) {
  if (typeof timestamp !== 'string' || timestamp.length < 16) return '—'
  const [hourStr, minuteStr] = timestamp.slice(11, 16).split(':')
  const hour24 = Number(hourStr)
  const period = hour24 >= 12 ? 'pm' : 'am'
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  return `${hour12}:${minuteStr}${period}`
}

export function formatDay(timestamp) {
  if (typeof timestamp !== 'string' || timestamp.length < 10) return '—'
  const [, month, day] = timestamp.slice(0, 10).split('-')
  return `${day}/${month}`
}
