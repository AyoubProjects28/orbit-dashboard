import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CallDetail from './CallDetail'

const doneCall = {
  callId: 'c1', vm: 'llm', seq: 2, ts0: 1754331484.1, ts1: 1754331488.6, status: 'done',
  sent: { summary: '→ qwen2.5:7b · 3 msg', detail: { model: 'qwen2.5:7b' } },
  received: { summary: '← tool_calls: add', detail: { tool_calls: ['add'] } },
}

const pendingCall = {
  callId: 'c2', vm: 'mcp', seq: 3, ts0: 1754331500, ts1: null, status: 'pending',
  sent: { summary: '→ add({"a":2,"b":2})', detail: { tool: 'add' } },
  received: null,
}

const errorCall = {
  callId: 'c3', vm: 'llm', seq: 4, ts0: 1754331510, ts1: 1754331511, status: 'error',
  sent: { summary: '→ qwen2.5:7b', detail: {} },
  received: { summary: '✗ timeout', detail: { error: 'timeout' } },
}

const truncatedCall = {
  callId: 'c4', vm: 'llm', seq: 5, ts0: 1754331520, ts1: 1754331522, status: 'done',
  sent: { summary: '→ big', detail: { truncated: true, preview: '{"a":1' } },
  received: { summary: '← ok', detail: { r: 1 } },
}

describe('CallDetail', () => {
  it('affiche les deux résumés et la latence', () => {
    render(<CallDetail call={doneCall} onClose={() => {}} />)
    expect(screen.getByText(doneCall.sent.summary)).toBeInTheDocument()
    expect(screen.getByText(doneCall.received.summary)).toBeInTheDocument()
    expect(screen.getByText(/latence 4.5 s/)).toBeInTheDocument()
  })

  it('affiche "en attente…" pour un appel pending', () => {
    render(<CallDetail call={pendingCall} onClose={() => {}} />)
    expect(screen.getByText('en attente…')).toBeInTheDocument()
  })

  it('affiche le message d\'erreur pour un appel error', () => {
    render(<CallDetail call={errorCall} onClose={() => {}} />)
    expect(screen.getByText('✗ timeout')).toBeInTheDocument()
  })

  it('révèle le JSON complet au clic sur "View payload"', async () => {
    render(<CallDetail call={doneCall} onClose={() => {}} />)
    await userEvent.click(screen.getAllByRole('button', { name: /view payload/i })[0])
    expect(screen.getByText(/"model": "qwen2.5:7b"/)).toBeInTheDocument()
  })

  it('affiche le preview brut suivi du marqueur de troncature pour un payload tronqué', async () => {
    render(<CallDetail call={truncatedCall} onClose={() => {}} />)
    await userEvent.click(screen.getAllByRole('button', { name: /view payload/i })[0])
    expect(screen.getByText(/"a":1/)).toBeInTheDocument()
    expect(screen.getByText(/tronqué à 10 Ko/)).toBeInTheDocument()
  })

  it('ferme au clic sur ×', async () => {
    const onClose = vi.fn()
    render(<CallDetail call={doneCall} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('ferme sur Échap', async () => {
    const onClose = vi.fn()
    render(<CallDetail call={doneCall} onClose={onClose} />)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})
