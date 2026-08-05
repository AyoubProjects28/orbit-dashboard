import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
// Explicit extensions: see the comment in BubbleChart.jsx — on a
// case-insensitive filesystem, the extensionless import of './BubbleChart'
// resolves to the wrong file (bubbleChart.js instead of BubbleChart.jsx).
import BubbleChart from './BubbleChart.jsx'
import { normalizeRun } from '../../lib/benchmark'
import { bubbleRadius, valueY } from './bubbleChart.js'

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
