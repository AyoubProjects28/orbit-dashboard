import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TurnRow from './TurnRow'

const baseTurn = {
  id: 't1', ts: '2026-08-04T12:58:04.000Z', prompt: 'Add 2 and 2', reply: '4',
  route: 'llm-full', tools_called: [], metrics: { prompt_tokens: 10, completion_tokens: 5, latency_ms: 4500 },
  sampling: null,
}

describe('TurnRow', () => {
  it('affiche la section Appels quand turn.calls existe', async () => {
    const turn = {
      ...baseTurn,
      calls: [
        { seq: 1, vm: 'llm', summary_sent: '→ qwen2.5:7b · 1 msg', summary_received: '← tool_calls: add', ts0: 1, ts1: 2, latency_ms: 4512, status: 'done' },
        { seq: 2, vm: 'mcp', summary_sent: '→ add({"a":2,"b":2})', summary_received: '← add (12 bytes)', ts0: 2, ts1: 2.03, latency_ms: 31, status: 'done' },
      ],
    }
    render(<TurnRow turn={turn} />)
    await userEvent.click(screen.getByRole('button', { name: /Add 2 and 2/ }))
    expect(screen.getByText('Calls')).toBeInTheDocument()
    expect(screen.getByText(/tool_calls: add/)).toBeInTheDocument()
    expect(screen.getByText('4.51 s')).toBeInTheDocument()
  })

  it('n\'affiche pas la section Appels quand turn.calls est absent', async () => {
    render(<TurnRow turn={baseTurn} />)
    await userEvent.click(screen.getByRole('button', { name: /Add 2 and 2/ }))
    expect(screen.queryByText('Calls')).not.toBeInTheDocument()
  })
})
