import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
// Explicit extensions: see the comment in BubbleChart.jsx — on a
// case-insensitive filesystem, the extensionless import of './BubbleChart'
// resolves to the wrong file (bubbleChart.js instead of BubbleChart.jsx).
import BubbleChart, { clientToSvgPoint } from './BubbleChart.jsx'
import { normalizeRun } from '../../lib/benchmark'
import { GEOM, bubbleRadius, valueY } from './bubbleChart.js'

const RUNS = [
  normalizeRun({
    timestamp: '2026-08-04T15:45:48-04:00', session_id: 'a', condition: 'with-forced',
    used_mcp_tool: true, cost_usd: 0.5974, accuracy: 1, noise_rate: 0,
    exact_match: true, expected_count: 6, found_count: 6, matched_count: 6,
    app: 'recipe', question_id: 'table-count',
  }, 0),
  normalizeRun({
    timestamp: '2026-08-04T16:27:42-04:00', session_id: 'b', condition: 'without',
    used_mcp_tool: false, cost_usd: 1.4356, accuracy: 0, noise_rate: 1,
    exact_match: false, expected_count: 6, found_count: 4, matched_count: 0,
    app: 'recipe', question_id: 'table-count',
  }, 1),
  normalizeRun({
    timestamp: '2026-08-05T13:47:44-04:00', session_id: 'c', condition: 'with',
    used_mcp_tool: false, cost_usd: 2.576, accuracy: 1, noise_rate: 0.45,
    exact_match: false, expected_count: 6, found_count: 11, matched_count: 6,
    app: 'recipe', question_id: 'table-count',
  }, 2),
]

function renderChart(props = {}) {
  return render(
    <BubbleChart runs={RUNS} metric="accuracy" yLabel="Accuracy" {...props} />,
  )
}

function expectPointCloseTo(point, { x, y }) {
  expect(point.x).toBeCloseTo(x)
  expect(point.y).toBeCloseTo(y)
}

describe('clientToSvgPoint', () => {
  it('maps a client point 1:1 when the rect exactly matches the default viewBox', () => {
    const rect = { left: 0, top: 0, width: 780, height: 334 }
    const viewBox = { x: 0, y: 0, w: 780, h: 334 }
    expectPointCloseTo(clientToSvgPoint(rect, viewBox, 200, 100), { x: 200, y: 100 })
  })

  it('accounts for a non-default viewBox origin and a rect offset/scaled on the page', () => {
    // Rendered at half scale (390x167 screen px for a 200x150 viewBox slice),
    // offset on the page, and the viewBox itself is already zoomed in.
    const rect = { left: 50, top: 20, width: 390, height: 167 }
    const viewBox = { x: 100, y: 50, w: 200, h: 150 }
    expectPointCloseTo(clientToSvgPoint(rect, viewBox, 50, 20), { x: 100, y: 50 })
    expectPointCloseTo(clientToSvgPoint(rect, viewBox, 245, 103.5), { x: 200, y: 125 })
  })
})

function mockSvgRect(svg, { width = GEOM.width, height = GEOM.height, left = 0, top = 0 } = {}) {
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
    left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {},
  })
}

describe('BubbleChart — drag-to-zoom', () => {
  it('zooms the viewBox to the dragged rectangle when the drag is at least 10px on screen', () => {
    const { container } = renderChart()
    const svg = container.querySelector('svg.bubble-chart')
    mockSvgRect(svg)
    fireEvent.mouseDown(svg, { clientX: 100, clientY: 50, button: 0 })
    fireEvent.mouseMove(window, { clientX: 300, clientY: 200 })
    fireEvent.mouseUp(window)
    expect(svg).toHaveAttribute('viewBox', '100 50 200 150')
  })

  it('normalizes a drag pulled from bottom-right to top-left', () => {
    const { container } = renderChart()
    const svg = container.querySelector('svg.bubble-chart')
    mockSvgRect(svg)
    fireEvent.mouseDown(svg, { clientX: 300, clientY: 200, button: 0 })
    fireEvent.mouseMove(window, { clientX: 100, clientY: 50 })
    fireEvent.mouseUp(window)
    expect(svg).toHaveAttribute('viewBox', '100 50 200 150')
  })

  it('ignores a drag smaller than 10px on screen — treated as a click, not a zoom', () => {
    const { container } = renderChart()
    const svg = container.querySelector('svg.bubble-chart')
    mockSvgRect(svg)
    const before = svg.getAttribute('viewBox')
    fireEvent.mouseDown(svg, { clientX: 100, clientY: 50, button: 0 })
    fireEvent.mouseMove(window, { clientX: 105, clientY: 53 })
    fireEvent.mouseUp(window)
    expect(svg).toHaveAttribute('viewBox', before)
  })

  it('ignores a right-button drag', () => {
    const { container } = renderChart()
    const svg = container.querySelector('svg.bubble-chart')
    mockSvgRect(svg)
    const before = svg.getAttribute('viewBox')
    fireEvent.mouseDown(svg, { clientX: 100, clientY: 50, button: 2 })
    fireEvent.mouseMove(window, { clientX: 300, clientY: 200 })
    fireEvent.mouseUp(window)
    expect(svg).toHaveAttribute('viewBox', before)
  })

  it('shows a translucent rectangle overlay while dragging, removed once released', () => {
    const { container } = renderChart()
    const svg = container.querySelector('svg.bubble-chart')
    mockSvgRect(svg)
    fireEvent.mouseDown(svg, { clientX: 100, clientY: 50, button: 0 })
    fireEvent.mouseMove(window, { clientX: 300, clientY: 200 })
    expect(container.querySelector('.bubble-zoom-rect')).toBeInTheDocument()
    fireEvent.mouseUp(window)
    expect(container.querySelector('.bubble-zoom-rect')).not.toBeInTheDocument()
  })

  it('a second drag zooms relative to the current viewBox, not the original extent', () => {
    const { container } = renderChart()
    const svg = container.querySelector('svg.bubble-chart')
    mockSvgRect(svg)
    fireEvent.mouseDown(svg, { clientX: 100, clientY: 50, button: 0 })
    fireEvent.mouseMove(window, { clientX: 300, clientY: 200 })
    fireEvent.mouseUp(window)
    expect(svg).toHaveAttribute('viewBox', '100 50 200 150')

    // Dragging across the same screen rect again should now map onto the
    // CURRENT viewBox (100 50 200 150), not back onto the default extent.
    fireEvent.mouseDown(svg, { clientX: 0, clientY: 0, button: 0 })
    fireEvent.mouseMove(window, { clientX: GEOM.width / 2, clientY: GEOM.height / 2 })
    fireEvent.mouseUp(window)
    expect(svg).toHaveAttribute('viewBox', '100 50 100 75')
  })

  it('applies the same drag-to-zoom behavior to the grouped render branch', () => {
    const groupedRuns = [
      normalizeRun({
        timestamp: '2026-08-04T15:45:48-04:00', session_id: 'a', question_id: 'q',
        condition: 'with', used_mcp_tool: true, cost_usd: 0.5, accuracy: 1, noise_rate: 0,
      }, 0),
    ]
    const { container } = render(
      <BubbleChart runs={groupedRuns} metric="accuracy" yLabel="Accuracy" groupBy="session" />,
    )
    const svg = container.querySelector('svg.bubble-chart')
    mockSvgRect(svg)
    fireEvent.mouseDown(svg, { clientX: 100, clientY: 50, button: 0 })
    fireEvent.mouseMove(window, { clientX: 300, clientY: 200 })
    fireEvent.mouseUp(window)
    expect(svg).toHaveAttribute('viewBox', '100 50 200 150')
  })

  it('resets to the default viewBox on remount (e.g. switching sub-tabs)', () => {
    const { container, unmount } = renderChart()
    const svg = container.querySelector('svg.bubble-chart')
    mockSvgRect(svg)
    fireEvent.mouseDown(svg, { clientX: 100, clientY: 50, button: 0 })
    fireEvent.mouseMove(window, { clientX: 300, clientY: 200 })
    fireEvent.mouseUp(window)
    expect(svg).toHaveAttribute('viewBox', '100 50 200 150')

    unmount()
    const { container: container2 } = renderChart()
    const svg2 = container2.querySelector('svg.bubble-chart')
    expect(svg2).toHaveAttribute('viewBox', `0 0 ${GEOM.width} ${GEOM.height}`)
  })

  it('shows no reset button until a zoom is active', () => {
    const { container } = renderChart()
    expect(container.querySelector('.bubble-zoom-reset')).not.toBeInTheDocument()
  })

  it('shows a reset button after zooming, which restores the default viewBox and hides itself again', () => {
    const { container } = renderChart()
    const svg = container.querySelector('svg.bubble-chart')
    mockSvgRect(svg)
    fireEvent.mouseDown(svg, { clientX: 100, clientY: 50, button: 0 })
    fireEvent.mouseMove(window, { clientX: 300, clientY: 200 })
    fireEvent.mouseUp(window)

    const resetBtn = container.querySelector('.bubble-zoom-reset')
    expect(resetBtn).toBeInTheDocument()
    fireEvent.click(resetBtn)
    expect(svg).toHaveAttribute('viewBox', `0 0 ${GEOM.width} ${GEOM.height}`)
    expect(container.querySelector('.bubble-zoom-reset')).not.toBeInTheDocument()
  })
})

describe('BubbleChart', () => {
  it('shows an empty state rather than a chart with no axes', () => {
    render(<BubbleChart runs={[]} metric="accuracy" yLabel="Accuracy" emptyLabel="Drop a file." />)
    expect(screen.getByText('Drop a file.')).toBeInTheDocument()
  })

  it('draws one bubble per run', () => {
    const { container } = renderChart()
    expect(container.querySelectorAll('[data-testid="bubble"]')).toHaveLength(3)
  })

  it('only renders hollow the bubble where the MCP was available and not called', () => {
    const { container } = renderChart()
    const hollow = container.querySelectorAll('[data-hollow="true"]')
    // Only the `with` run with no MCP call counts: the `without` run never
    // had the MCP, so not calling it is not a decision by the agent.
    expect(hollow).toHaveLength(1)
    expect(hollow[0].getAttribute('data-run-id')).toContain('c')
    expect(hollow[0].querySelector('circle')).toHaveAttribute('stroke-dasharray', '4 3')
  })

  it('leaves a run with no MCP available drawn as a solid bubble', () => {
    const { container } = renderChart()
    const bubbles = container.querySelectorAll('[data-testid="bubble"]')
    expect(bubbles[1].getAttribute('data-hollow')).toBe('false')
  })

  it('colors each bubble by its condition', () => {
    const { container } = renderChart()
    const circles = container.querySelectorAll('[data-testid="bubble"] circle')
    expect(circles[0]).toHaveAttribute('fill', '#23e6d1')
    expect(circles[1]).toHaveAttribute('fill', '#ff2e88')
    expect(circles[2]).toHaveAttribute('fill', '#ffb63d')
  })

  it('sizes the bubble by the run cost', () => {
    const { container } = renderChart()
    const circles = container.querySelectorAll('[data-testid="bubble"] circle')
    expect(Number(circles[0].getAttribute('r'))).toBeCloseTo(bubbleRadius(0.5974))
    expect(Number(circles[2].getAttribute('r'))).toBeGreaterThan(Number(circles[0].getAttribute('r')))
  })

  it('positions by accuracy when the metric is accuracy', () => {
    const { container } = renderChart()
    const circles = container.querySelectorAll('[data-testid="bubble"] circle')
    expect(Number(circles[0].getAttribute('cy'))).toBeCloseTo(valueY(1, false))
    expect(Number(circles[1].getAttribute('cy'))).toBeCloseTo(valueY(0, false))
  })

  it('inverts the axis on the noise sub-tab: 0% noise at the top', () => {
    const { container } = renderChart({ metric: 'noise', invert: true })
    const circles = container.querySelectorAll('[data-testid="bubble"] circle')
    // run 0: 0% noise → all the way up. run 1: 100% noise → all the way down.
    expect(Number(circles[0].getAttribute('cy'))).toBeLessThan(Number(circles[1].getAttribute('cy')))
    expect(Number(circles[0].getAttribute('cy'))).toBeCloseTo(valueY(0, true))
  })

  it('draws a separator on a batch change', () => {
    const { container } = renderChart()
    expect(container.querySelectorAll('.bubble-batch-split')).toHaveLength(1)
  })

  it('puts the cost first in the tooltip, ahead of everything else', () => {
    const { container } = renderChart()
    const title = container.querySelector('[data-testid="bubble"] title').textContent
    expect(title.split('\n')[0]).toBe('$0.60 — run cost')
    expect(title).toContain('MCP called')
  })

  it('explicitly flags a run where the MCP was not called', () => {
    const { container } = renderChart()
    const titles = container.querySelectorAll('[data-testid="bubble"] title')
    expect(titles[2].textContent).toContain('MCP NOT called')
    expect(titles[2].textContent).toContain('5 tables invented')
  })
})

describe('BubbleChart — grouped (Group by: Session / Question)', () => {
  const GROUPED_RUNS = [
    normalizeRun({
      timestamp: '2026-08-04T15:45:48-04:00', session_id: 'sA', question_id: 'table-count',
      condition: 'without', used_mcp_tool: false, cost_usd: 1.0, accuracy: 0, noise_rate: 1,
    }, 0),
    normalizeRun({
      timestamp: '2026-08-04T16:27:42-04:00', session_id: 'sA', question_id: 'table-count',
      condition: 'with', used_mcp_tool: true, cost_usd: 0.4, accuracy: 1, noise_rate: 0,
    }, 1),
    normalizeRun({
      timestamp: '2026-08-05T13:47:44-04:00', session_id: 'sB', question_id: 'table-count',
      condition: 'with', used_mcp_tool: false, cost_usd: 0.6, accuracy: 1, noise_rate: 0.2,
    }, 2),
  ]

  it('still renders the ungrouped per-run chart when groupBy is "run" (the default)', () => {
    const { container } = render(<BubbleChart runs={GROUPED_RUNS} metric="accuracy" yLabel="Accuracy" groupBy="run" />)
    expect(container.querySelectorAll('[data-testid="bubble"]')).toHaveLength(3)
    expect(container.querySelectorAll('[data-testid="bubble-group"]')).toHaveLength(0)
  })

  it('groups by session: one bubble per condition present in each session', () => {
    const { container } = render(<BubbleChart runs={GROUPED_RUNS} metric="accuracy" yLabel="Accuracy" groupBy="session" />)
    const bubbles = container.querySelectorAll('[data-testid="bubble-group"]')
    // sA has 2 conditions (without, with), sB has 1 (with) -> 3 total
    expect(bubbles).toHaveLength(3)
    const sA = [...bubbles].filter((b) => b.getAttribute('data-group-key') === 'sA')
    expect(sA).toHaveLength(2)
  })

  it('groups by question: every run here shares the same question, so it collapses to one group', () => {
    const { container } = render(<BubbleChart runs={GROUPED_RUNS} metric="accuracy" yLabel="Accuracy" groupBy="question" />)
    const bubbles = container.querySelectorAll('[data-testid="bubble-group"]')
    const keys = new Set([...bubbles].map((b) => b.getAttribute('data-group-key')))
    expect(keys).toEqual(new Set(['table-count']))
    // 3 runs across 2 conditions in that one group (without, with) -> 2 bubbles
    expect(bubbles).toHaveLength(2)
  })

  it('draws a condition-bucket hollow only when the MCP was available and known not to have been called', () => {
    const { container } = render(<BubbleChart runs={GROUPED_RUNS} metric="accuracy" yLabel="Accuracy" groupBy="session" />)
    const hollow = container.querySelectorAll('[data-testid="bubble-group"][data-hollow="true"]')
    expect(hollow).toHaveLength(1)
    expect(hollow[0].getAttribute('data-group-key')).toBe('sB')
  })

  it('draws a connector only for a group with more than one plotted condition', () => {
    const { container } = render(<BubbleChart runs={GROUPED_RUNS} metric="accuracy" yLabel="Accuracy" groupBy="session" />)
    expect(container.querySelectorAll('polyline')).toHaveLength(1) // only sA has 2 conditions
  })

  it('shows an empty state rather than a broken chart with no runs at all, even when grouped', () => {
    render(<BubbleChart runs={[]} metric="accuracy" yLabel="Accuracy" groupBy="session" emptyLabel="Drop a file." />)
    expect(screen.getByText('Drop a file.')).toBeInTheDocument()
  })
})
