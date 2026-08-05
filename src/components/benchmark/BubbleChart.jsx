import {
  GEOM,
  GRID_LEVELS,
  LABEL_OFFSET,
  batchBoundaries,
  bubbleRadius,
  formatClock,
  formatCost,
  formatDay,
  plotHeight,
  plotWidth,
  rankX,
  valueY,
// Explicit extension for the same reason as in BenchmarkTab.jsx: don't let
// Vite guess between bubbleChart.js and BubbleChart.jsx on a case-insensitive
// filesystem.
} from './bubbleChart.js'
import { conditionColor, conditionLabel, mcpSkipped } from '../../lib/benchmark'

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
function BubbleChart({ runs, metric, invert = false, yLabel, emptyLabel }) {
  if (!runs || runs.length === 0) {
    return <p className="panel-empty">{emptyLabel ?? 'No runs to display.'}</p>
  }

  const total = runs.length
  const w = plotWidth()
  const h = plotHeight()
  const bandHeight = h * 0.12
  const boundaries = batchBoundaries(runs)
  const axisBottom = GEOM.padTop + h

  return (
    <svg
      className="bubble-chart"
      viewBox={`0 0 ${GEOM.width} ${GEOM.height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`${yLabel} per run, bubble size proportional to cost`}
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
    </svg>
  )
}

export default BubbleChart
