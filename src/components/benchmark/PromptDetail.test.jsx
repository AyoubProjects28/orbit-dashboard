import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PromptDetail from './PromptDetail.jsx'
import { buildRuns, groupRuns } from '../../lib/families'

function turn(overrides = {}) {
  return {
    id: 't1',
    prompt_key: 'sha1:a',
    prompt: 'How many files are there?',
    session_id: 's1',
    provider: 'ollama:qwen2.5:7b',
    condition: 'authorized',
    used_mcp_tool: true,
    metrics: { cost_usd: 0.001, latency_ms: 1000, total_tokens: 500 },
    ...overrides,
  }
}

function completeGroup({ costByCondition = {}, gradesByTurn = {}, usedMcpByTurn = {} } = {}) {
  const conditions = ['no-mcp', 'authorized', 'forced']
  const turns = conditions.map((condition) => turn({
    id: `t-${condition}`,
    condition,
    used_mcp_tool: usedMcpByTurn[condition] ?? true,
    metrics: { cost_usd: costByCondition[condition] ?? 0.001, latency_ms: 1000, total_tokens: 500 },
  }))
  const assignments = turns.map((t) => ({ turn_id: t.id, family_id: 'fam_a' }))
  const grades = Object.entries(gradesByTurn).map(([turnId, grade]) => ({ turn_id: turnId, ...grade }))
  const runs = buildRuns({ turns, assignments, grades, families: [], expectations: [] })
  return groupRuns('prompt', runs)[0]
}

describe('PromptDetail', () => {
  it('shows a graceful fallback when the group is gone (e.g. reassigned mid-view)', () => {
    const onBack = vi.fn()
    render(<PromptDetail family={{ name: 'Docs' }} group={null} prompt="x" expectation={null} onBack={onBack} />)
    expect(screen.getByText(/no longer available/)).toBeInTheDocument()
  })

  it('back button calls onBack', async () => {
    const onBack = vi.fn()
    render(<PromptDetail family={{ name: 'Docs' }} group={null} prompt="x" expectation={null} onBack={onBack} />)
    await userEvent.click(screen.getByRole('button', { name: /Back to family/ }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('renders the prompt text and family breadcrumb', () => {
    const group = completeGroup()
    render(<PromptDetail family={{ name: 'Doc questions' }} group={group} prompt="How many files?" expectation={null} onBack={() => {}} />)
    expect(screen.getByText('How many files?')).toBeInTheDocument()
    expect(screen.getByText(/Doc questions \/ prompt/)).toBeInTheDocument()
  })

  it('shows "not set" for the expected answer when no expectation exists yet', () => {
    const group = completeGroup()
    render(<PromptDetail family={{ name: 'Docs' }} group={group} prompt="x" expectation={null} onBack={() => {}} />)
    expect(screen.getByText(/not set/)).toBeInTheDocument()
  })

  it('shows the expected answer and match mode when an expectation is set', () => {
    const group = completeGroup()
    render(
      <PromptDetail
        family={{ name: 'Docs' }}
        group={group}
        prompt="x"
        expectation={{ expected_items: ['12'], match: 'contains' }}
        onBack={() => {}}
      />,
    )
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('contains')).toBeInTheDocument()
  })

  it('computes a cost delta between no-mcp and the best condition (forced over authorized)', () => {
    // no-mcp costs 4x forced -> delta should read ÷4.0
    const group = completeGroup({ costByCondition: { 'no-mcp': 0.004, authorized: 0.002, forced: 0.001 } })
    render(<PromptDetail family={{ name: 'Docs' }} group={group} prompt="x" expectation={null} onBack={() => {}} />)
    expect(screen.getByText('÷4.0')).toBeInTheDocument()
  })

  it('shows "not graded" rather than a fake accuracy when nothing is graded', () => {
    const group = completeGroup()
    render(<PromptDetail family={{ name: 'Docs' }} group={group} prompt="x" expectation={null} onBack={() => {}} />)
    expect(screen.getAllByText('not graded').length).toBeGreaterThan(0)
  })

  it('marks a graded run correct/incorrect and an ungraded run as "not graded" in the run pills', () => {
    const group = completeGroup({
      gradesByTurn: {
        't-no-mcp': { expected_count: 1, matched_count: 0, found_count: 1 }, // wrong
        't-authorized': { expected_count: 1, matched_count: 1, found_count: 1 }, // right
        // t-forced: left ungraded
      },
    })
    const { container } = render(<PromptDetail family={{ name: 'Docs' }} group={group} prompt="x" expectation={null} onBack={() => {}} />)
    const pills = container.querySelectorAll('.run-pill')
    expect(pills).toHaveLength(3)
    const text = [...pills].map((p) => p.textContent).join(' | ')
    expect(text).toContain('✗')
    expect(text).toContain('✓')
    expect(text).toContain('not graded')
  })

  it('flags a run where the MCP was available and known not to have been called', () => {
    const group = completeGroup({ usedMcpByTurn: { authorized: false } })
    const { container } = render(<PromptDetail family={{ name: 'Docs' }} group={group} prompt="x" expectation={null} onBack={() => {}} />)
    expect(container.textContent).toContain('MCP skipped')
  })

  describe('editing the expectation', () => {
    it('pre-fills the form from the existing expectation on Edit', async () => {
      const group = completeGroup()
      render(
        <PromptDetail
          family={{ name: 'Docs' }}
          group={group}
          prompt="x"
          promptKey="sha1:a"
          expectation={{ expected_items: ['12', '13'], match: 'regex' }}
          onBack={() => {}}
          onSetExpectation={vi.fn()}
          onGradeRun={vi.fn()}
        />,
      )
      await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
      expect(screen.getByLabelText(/Expected item/)).toHaveValue('12, 13')
    })

    it('rejects an empty expected-items list client-side, without calling onSetExpectation', async () => {
      const onSetExpectation = vi.fn()
      const group = completeGroup()
      render(
        <PromptDetail
          family={{ name: 'Docs' }} group={group} prompt="x" promptKey="sha1:a"
          expectation={null} onBack={() => {}} onSetExpectation={onSetExpectation} onGradeRun={vi.fn()}
        />,
      )
      await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
      await userEvent.click(screen.getByRole('button', { name: 'Save' }))
      expect(screen.getByText(/At least one expected item/)).toBeInTheDocument()
      expect(onSetExpectation).not.toHaveBeenCalled()
    })

    it('saves the parsed comma-separated items and chosen mode', async () => {
      const onSetExpectation = vi.fn().mockResolvedValue()
      const group = completeGroup()
      render(
        <PromptDetail
          family={{ name: 'Docs' }} group={group} prompt="x" promptKey="sha1:a"
          expectation={null} onBack={() => {}} onSetExpectation={onSetExpectation} onGradeRun={vi.fn()}
        />,
      )
      await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
      await userEvent.type(screen.getByLabelText(/Expected item/), '12, 13')
      await userEvent.click(screen.getByRole('button', { name: 'Manual' }))
      await userEvent.click(screen.getByRole('button', { name: 'Save' }))
      expect(onSetExpectation).toHaveBeenCalledWith('sha1:a', { expectedItems: ['12', '13'], match: 'manual' })
    })
  })

  describe('manual grading', () => {
    it('shows no ✓/✗ grading buttons when the mode is auto', () => {
      const group = completeGroup()
      const { container } = render(
        <PromptDetail
          family={{ name: 'Docs' }} group={group} prompt="x" promptKey="sha1:a"
          expectation={{ expected_items: ['12'], match: 'contains' }}
          onBack={() => {}} onSetExpectation={vi.fn()} onGradeRun={vi.fn()}
        />,
      )
      expect(container.querySelectorAll('.run-pill-grade')).toHaveLength(0)
    })

    it('shows ✓/✗ grading buttons per run when the mode is manual', () => {
      const group = completeGroup()
      const { container } = render(
        <PromptDetail
          family={{ name: 'Docs' }} group={group} prompt="x" promptKey="sha1:a"
          expectation={{ expected_items: ['12'], match: 'manual' }}
          onBack={() => {}} onSetExpectation={vi.fn()} onGradeRun={vi.fn()}
        />,
      )
      // one grading widget per run pill (3 conditions x 1 run each)
      expect(container.querySelectorAll('.run-pill-grade')).toHaveLength(3)
    })

    it('marking a run correct grades it matched === expected against the expectation size', async () => {
      const onGradeRun = vi.fn().mockResolvedValue()
      const group = completeGroup()
      render(
        <PromptDetail
          family={{ name: 'Docs' }} group={group} prompt="x" promptKey="sha1:a"
          expectation={{ expected_items: ['12', '13'], match: 'manual' }}
          onBack={() => {}} onSetExpectation={vi.fn()} onGradeRun={onGradeRun}
        />,
      )
      const [firstCorrectButton] = screen.getAllByTitle('Mark correct')
      await userEvent.click(firstCorrectButton)
      expect(onGradeRun).toHaveBeenCalledWith(expect.any(String), { expectedCount: 2, matchedCount: 2, foundCount: 2 })
    })

    it('marking a run incorrect grades matched/found as 0', async () => {
      const onGradeRun = vi.fn().mockResolvedValue()
      const group = completeGroup()
      render(
        <PromptDetail
          family={{ name: 'Docs' }} group={group} prompt="x" promptKey="sha1:a"
          expectation={{ expected_items: ['12'], match: 'manual' }}
          onBack={() => {}} onSetExpectation={vi.fn()} onGradeRun={onGradeRun}
        />,
      )
      const [firstWrongButton] = screen.getAllByTitle('Mark incorrect')
      await userEvent.click(firstWrongButton)
      expect(onGradeRun).toHaveBeenCalledWith(expect.any(String), { expectedCount: 1, matchedCount: 0, foundCount: 0 })
    })
  })
})
