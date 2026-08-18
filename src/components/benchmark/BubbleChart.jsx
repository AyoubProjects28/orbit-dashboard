import { useRef, useState } from 'react'
import {
  GEOM,
  GRID_LEVELS,
  LABEL_OFFSET,
  batchBoundaries,
  bubbleRadius,
  conditionOffset,
  formatClock,
  formatCost,
  formatDay,
  groupStep,
  groupX,
  plotHeight,
  plotWidth,
  rankX,
  truncateLabel,
  valueY,
// Explicit extension for the same reason as in BenchmarkTab.jsx: don't let
// Vite guess between bubbleChart.js and BubbleChart.jsx on a case-insensitive
// filesystem.
} from './bubbleChart.js'
import { CONDITIONS, aggregateGroup, conditionColor, conditionLabel, groupRuns, mcpSkipped } from '../../lib/benchmark'

// Converts a mouse event's client (page) coordinates into the SVG's own
// user-space coordinates — the ones GEOM/rankX/valueY already work in.
// `rect` is the SVG element's getBoundingClientRect(); `viewBox` is the
// *currently applied* viewBox (not always the full GEOM extent), so that
// converting a point during an already-zoomed view is correct without a
// special case.
export function clientToSvgPoint(rect, viewBox, clientX, clientY) {
  return {
    x: viewBox.x + ((clientX - rect.left) / rect.width) * viewBox.w,
    y: viewBox.y + ((clientY - rect.top) / rect.height) * viewBox.h,
  }
}

const DEFAULT_VIEWBOX = { x: 0, y: 0, w: GEOM.width, h: GEOM.height }
const MIN_DRAG_SCREEN_PX = 10

// Coordinate math below (client px -> viewBox units, twice per drag) drifts
// by floating-point noise (e.g. 99.99999999999999 instead of 100). Rounding
// keeps the viewBox attribute clean and stops that noise from compounding
// across repeated zooms.
function round2(value) {
  return Math.round(value * 100) / 100
}

// Bubble chart: one run = one bubble.
//   X  = chronological rank      (see rankX in bubbleChart.js)
//   Y  = accuracy or noise       (metric)
//   Ø  = run cost                (area ∝ cost, see bubbleRadius)
//   ▉  = condition               (color)
//   ○  = MCP available but NOT called (hollow, dashed bubble — mcpSkipped)
//
// The hollow bubble isn't a cosmetic detail: in scores.jsonl, 2 `with` runs
// never called the MCP and behave exactly like `without` runs. Without this
// encoding, they'd read as MCP successes.
//
// The "ideal zone" band isn't labeled inside the SVG: that's exactly where
// the MCP bubbles cluster, so any label placed at the top of the frame ends
// up under a bubble. The meaning is carried by the axis label and the HTML
// legend, outside the drawing.
//
// Deliberately dumb component: it knows nothing about the file, the upload,
// or the active sub-tab. It receives an already-sorted list and a metric.
//
// groupBy ('run' | 'session' | 'question'): 'run' is the chart described
// above, unchanged. Anything else renders a DIFFERENT geometry — one X slot
// per group, up to 3 condition-bubbles inside it joined by a dashed
// connector — computed by groupRuns()/aggregateGroup() (src/lib/benchmark.js)
// rather than by touching a single line of the per-run path below.
function BubbleChart({ runs, metric, invert = false, yLabel, emptyLabel, groupBy = 'run' }) {
  const svgRef = useRef(null)
  const [viewBox, setViewBox] = useState(DEFAULT_VIEWBOX)
  const [drag, setDrag] = useState(null)

  // Rubber-band zoom: drag a rectangle on the SVG, release to crop the
  // viewBox to it — a magnifying-glass zoom (the whole drawing rescales),
  // not a data recalculation. Listeners are attached to `window` (not the
  // <svg>) for the duration of one drag, imperatively from inside
  // mousedown, so a drag that ends outside the chart still completes.
  function handleMouseDown(event) {
    if (event.button !== 0) return
    const svg = svgRef.current
    const startRect = svg.getBoundingClientRect()
    const start = clientToSvgPoint(startRect, viewBox, event.clientX, event.clientY)
    setDrag({ x0: start.x, y0: start.y, x1: start.x, y1: start.y })

    function handleMouseMove(moveEvent) {
      const rect = svg.getBoundingClientRect()
      const point = clientToSvgPoint(rect, viewBox, moveEvent.clientX, moveEvent.clientY)
      setDrag((prev) => (prev ? { ...prev, x1: point.x, y1: point.y } : prev))
    }

    function handleMouseUp() {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      setDrag((prev) => {
        if (prev) {
          const rect = svg.getBoundingClientRect()
          const svgDx = Math.abs(prev.x1 - prev.x0)
          const svgDy = Math.abs(prev.y1 - prev.y0)
          const screenDx = (svgDx / viewBox.w) * rect.width
          const screenDy = (svgDy / viewBox.h) * rect.height
          // A drag under 10px on screen is a click, not a zoom — preserves
          // the native bubble tooltip on a plain click.
          if (screenDx >= MIN_DRAG_SCREEN_PX && screenDy >= MIN_DRAG_SCREEN_PX) {
            setViewBox({
              x: round2(Math.min(prev.x0, prev.x1)),
              y: round2(Math.min(prev.y0, prev.y1)),
              w: round2(svgDx),
              h: round2(svgDy),
            })
          }
        }
        return null
      })
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  const isZoomed = viewBox.x !== DEFAULT_VIEWBOX.x || viewBox.y !== DEFAULT_VIEWBOX.y
    || viewBox.w !== DEFAULT_VIEWBOX.w || viewBox.h !== DEFAULT_VIEWBOX.h

  function resetZoom() {
    setViewBox(DEFAULT_VIEWBOX)
  }

  const zoomRectOverlay = drag && (
    <rect
      className="bubble-zoom-rect"
      x={Math.min(drag.x0, drag.x1)}
      y={Math.min(drag.y0, drag.y1)}
      width={Math.abs(drag.x1 - drag.x0)}
      height={Math.abs(drag.y1 - drag.y0)}
    />
  )

  const resetZoomButton = isZoomed && (
    <button type="button" className="bubble-zoom-reset" onClick={resetZoom}>
      Reset zoom
    </button>
  )

  if (!runs || runs.length === 0) {
    return <p className="panel-empty">{emptyLabel ?? 'No runs to display.'}</p>
  }

  if (groupBy !== 'run') {
    const groups = groupRuns(groupBy, runs)
    const w = plotWidth()
    const h = plotHeight()
    const axisBottom = GEOM.padTop + h
    const step = groupStep(groups.length)

    return (
      <div className="bubble-chart-frame">
        {resetZoomButton}
        <svg
          ref={svgRef}
          className="bubble-chart"
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`${yLabel} per ${groupBy}, bubble size proportional to cost`}
          onMouseDown={handleMouseDown}
        >
        {GRID_LEVELS.map((level) => {
          const y = valueY(level, invert)
          return (
            <g key={level}>
              <line x1={GEOM.padLeft} y1={y} x2={GEOM.padLeft + w} y2={y} className="bubble-grid" />
              <text x={GEOM.padLeft - 9} y={y + 3} className="bubble-tick" textAnchor="end">
                {Math.round(level * 100)}%
              </text>
            </g>
          )
        })}

        <text
          x={GEOM.padLeft - 46}
          y={GEOM.padTop + h / 2}
          className="bubble-axis-label"
          textAnchor="middle"
          transform={`rotate(-90 ${GEOM.padLeft - 46} ${GEOM.padTop + h / 2})`}
        >
          {yLabel}
        </text>

        {groups.map((group, gi) => {
          const cx = groupX(gi, groups.length)
          const present = CONDITIONS.filter((c) => group.byCondition[c].length > 0)
          const points = present.map((condition, pi) => {
            const agg = aggregateGroup(group.byCondition[condition])
            const value = metric === 'noise' ? agg.noise : agg.accuracy
            return { condition, agg, x: cx + conditionOffset(pi, present.length, step), y: valueY(value, invert) }
          })
          return (
            <g key={group.key}>
              {points.length > 1 && (
                <polyline
                  points={points.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="1" strokeDasharray="3 3"
                />
              )}
              {points.map((p) => {
                const hollow = p.agg.skipped > 0
                const color = conditionColor(p.condition)
                const r = bubbleRadius(p.agg.cost)
                return (
                  <g
                    key={p.condition}
                    data-testid="bubble-group"
                    data-group-key={group.key}
                    data-condition={p.condition}
                    data-hollow={hollow ? 'true' : 'false'}
                  >
                    <circle
                      cx={p.x} cy={p.y} r={r}
                      fill={hollow ? 'none' : color}
                      fillOpacity={hollow ? undefined : 0.55}
                      stroke={color}
                      strokeWidth={hollow ? 2 : 1.3}
                      strokeDasharray={hollow ? '4 3' : undefined}
                    />
                    <title>
                      {[
                        `${group.key} · ${conditionLabel(p.condition)} · n=${p.agg.n}`,
                        `${formatCost(p.agg.cost)} — median cost`,
                        `${metric === 'noise' ? 'Noise' : 'Accuracy'} ${Math.round((metric === 'noise' ? p.agg.noise : p.agg.accuracy) * 100)}%`,
                        hollow ? `⚠ MCP available but not called in ${p.agg.skipped}/${p.agg.n} run(s)` : null,
                      ].filter(Boolean).join('\n')}
                    </title>
                  </g>
                )
              })}
            </g>
          )
        })}

        {groups.map((group, gi) => (
          <text
            key={group.key}
            x={groupX(gi, groups.length)}
            y={axisBottom + LABEL_OFFSET.day}
            className="bubble-day"
            textAnchor="middle"
          >
            {truncateLabel(group.key)}
          </text>
        ))}
          {zoomRectOverlay}
        </svg>
      </div>
    )
  }

  const total = runs.length
  const w = plotWidth()
  const h = plotHeight()
  const bandHeight = h * 0.12
  const boundaries = batchBoundaries(runs)
  const axisBottom = GEOM.padTop + h

  return (
    <div className="bubble-chart-frame">
      {resetZoomButton}
      <svg
        ref={svgRef}
        className="bubble-chart"
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`${yLabel} per run, bubble size proportional to cost`}
        onMouseDown={handleMouseDown}
      >
      {GRID_LEVELS.map((level) => {
        const y = valueY(level, invert)
        return (
          <g key={level}>
            <line x1={GEOM.padLeft} y1={y} x2={GEOM.padLeft + w} y2={y} className="bubble-grid" />
            <text x={GEOM.padLeft - 9} y={y + 3} className="bubble-tick" textAnchor="end">
              {Math.round(level * 100)}%
            </text>
          </g>
        )
      })}

      {/* "Ideal zone" band, always at the top regardless of axis direction. */}
      <rect x={GEOM.padLeft} y={GEOM.padTop} width={w} height={bandHeight} className="bubble-band" />

      <text
        x={GEOM.padLeft - 46}
        y={GEOM.padTop + h / 2}
        className="bubble-axis-label"
        textAnchor="middle"
        transform={`rotate(-90 ${GEOM.padLeft - 46} ${GEOM.padTop + h / 2})`}
      >
        {yLabel}
      </text>

      {boundaries.map((index) => {
        const x = (rankX(index - 1, total) + rankX(index, total)) / 2
        return (
          <line
            key={`batch-${index}`}
            x1={x}
            y1={GEOM.padTop}
            x2={x}
            y2={axisBottom + LABEL_OFFSET.day}
            className="bubble-batch-split"
          />
        )
      })}

      {runs.map((run, index) => {
        const x = rankX(index, total)
        const y = valueY(metric === 'noise' ? run.noise : run.accuracy, invert)
        const r = bubbleRadius(run.cost)
        const color = conditionColor(run.condition)
        const hollow = mcpSkipped(run)
        return (
          <g key={run.id} data-testid="bubble" data-run-id={run.id} data-hollow={hollow ? 'true' : 'false'}>
            <line x1={x} y1={GEOM.padTop} x2={x} y2={axisBottom} className="bubble-rank-line" />
            <circle
              cx={x}
              cy={y}
              r={r}
              fill={color}
              fillOpacity={hollow ? 0.12 : 0.55}
              stroke={color}
              strokeWidth={hollow ? 2 : 1.3}
              strokeDasharray={hollow ? '4 3' : undefined}
            />
            {r > 12 && (
              <text x={x} y={y + 3.5} className="bubble-cost" textAnchor="middle">
                {formatCost(run.cost)}
              </text>
            )}
            <text
              x={x}
              y={axisBottom + LABEL_OFFSET.clock}
              className="bubble-clock"
              textAnchor="middle"
              transform={`rotate(-45 ${x} ${axisBottom + LABEL_OFFSET.clock})`}
            >
              {formatClock(run.timestamp)}
            </text>
            <title>
              {[
                `${formatCost(run.cost)} — run cost`,
                `${conditionLabel(run.condition)} · ${run.usedMcp ? 'MCP called' : 'MCP NOT called'}`,
                `${formatDay(run.timestamp)} ${formatClock(run.timestamp)} · ${run.app} / ${run.questionId}`,
                `Accuracy ${Math.round(run.accuracy * 100)}% (${run.matchedCount}/${run.expectedCount} tables found)`,
                `Noise ${Math.round(run.noise * 100)}% (${Math.max(0, run.foundCount - run.matchedCount)} tables invented)`,
                run.exactMatch ? 'Exact match' : 'Not exact',
              ].join('\n')}
            </title>
          </g>
        )
      })}

      {/* Day label: one per batch, placed on the batch's first run. */}
      {[0, ...boundaries].map((index) => (
        <text
          key={`day-${index}`}
          x={rankX(index, total)}
          y={axisBottom + LABEL_OFFSET.day}
          className="bubble-day"
          textAnchor="start"
        >
          {formatDay(runs[index].timestamp)}
        </text>
      ))}
        {zoomRectOverlay}
      </svg>
    </div>
  )
}

export default BubbleChart
