import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BenchmarkTab from './BenchmarkTab'
import { STORAGE_KEY, saveScores } from '../../lib/benchmark'

function line(overrides) {
  return JSON.stringify({
    timestamp: '2026-08-04T16:36:22-04:00',
    session_id: 's1',
    app: 'recipe',
    question_id: 'table-count',
    condition: 'with-forced',
    run_index: 1,
    used_mcp_tool: true,
    cost_usd: 0.29,
    expected_count: 6,
    found_count: 6,
    matched_count: 6,
    accuracy: 1,
    noise_rate: 0,
    exact_match: true,
    ...overrides,
  })
}

const JSONL = [
  line({ session_id: 's1' }),
  line({ session_id: 's2', timestamp: '2026-08-05T13:47:44-04:00', condition: 'without', used_mcp_tool: false, cost_usd: 3.14, noise_rate: 0.33, exact_match: false, found_count: 9 }),
].join('\n')

function upload(text, name = 'scores.jsonl') {
  const file = new File([text], name, { type: 'application/x-ndjson' })
  return userEvent.upload(screen.getByLabelText('Load a scores.jsonl'), file)
}

beforeEach(() => {
  globalThis.localStorage.clear()
})

describe('BenchmarkTab', () => {
  it('prompts to drop a file as long as nothing is loaded', () => {
    render(<BenchmarkTab />)
    expect(screen.getByText(/Drop a scores.jsonl/)).toBeInTheDocument()
  })

  it('shows the Accuracy and Noise sub-tabs', () => {
    render(<BenchmarkTab />)
    expect(screen.getByRole('tab', { name: 'Accuracy' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Noise' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Accuracy' })).toHaveAttribute('aria-selected', 'true')
  })

  it('draws the runs after the file is dropped', async () => {
    const { container } = render(<BenchmarkTab />)
    await upload(JSONL)
    await waitFor(() => expect(container.querySelectorAll('[data-testid="bubble"]')).toHaveLength(2))
    expect(screen.getByText(/scores.jsonl · 2 runs/)).toBeInTheDocument()
  })

  it('switches to the Noise sub-tab without losing the runs', async () => {
    const { container } = render(<BenchmarkTab />)
    await upload(JSONL)
    await waitFor(() => expect(container.querySelectorAll('[data-testid="bubble"]')).toHaveLength(2))
    await userEvent.click(screen.getByRole('tab', { name: 'Noise' }))
    expect(container.querySelectorAll('[data-testid="bubble"]')).toHaveLength(2)
    expect(screen.getByLabelText(/Noise/)).toBeInTheDocument()
  })

  it('persists the file and restores it on remount', async () => {
    const { unmount } = render(<BenchmarkTab />)
    await upload(JSONL)
    await waitFor(() => expect(screen.getByText(/2 runs/)).toBeInTheDocument())
    unmount()

    const { container } = render(<BenchmarkTab />)
    await waitFor(() => expect(container.querySelectorAll('[data-testid="bubble"]')).toHaveLength(2))
  })

  it('clears the tab and the cache when Clear is clicked', async () => {
    render(<BenchmarkTab />)
    await upload(JSONL)
    await waitFor(() => expect(screen.getByText(/2 runs/)).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.getByText(/Drop a scores.jsonl/)).toBeInTheDocument()
    expect(globalThis.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('shows the valid runs and flags unreadable lines', async () => {
    const { container } = render(<BenchmarkTab />)
    await upload(`${JSONL}\n{"timestamp": "2026-08-`)
    await waitFor(() => expect(container.querySelectorAll('[data-testid="bubble"]')).toHaveLength(2))
    expect(screen.getByText(/1 line skipped/)).toBeInTheDocument()
  })

  it('rejects a file with no usable runs at all', async () => {
    render(<BenchmarkTab />)
    await upload('this is not jsonl')
    await waitFor(() => expect(screen.getByText(/No usable runs/)).toBeInTheDocument())
  })

  it('reminds that results have been manually verified', async () => {
    render(<BenchmarkTab />)
    await upload(JSONL)
    await waitFor(() => expect(screen.getByText(/manually verified against the codebase/)).toBeInTheDocument())
  })

  it('ignores a corrupted cache instead of breaking the tab', () => {
    globalThis.localStorage.setItem(STORAGE_KEY, '{{{')
    render(<BenchmarkTab />)
    expect(screen.getByText(/Drop a scores.jsonl/)).toBeInTheDocument()
  })

  it('restores from cache even if the run schema changed since then', async () => {
    // We store the RAW TEXT, so an older cache stays readable.
    saveScores(JSONL, 'old.jsonl')
    const { container } = render(<BenchmarkTab />)
    await waitFor(() => expect(container.querySelectorAll('[data-testid="bubble"]')).toHaveLength(2))
    expect(screen.getByText(/old.jsonl/)).toBeInTheDocument()
  })
})
