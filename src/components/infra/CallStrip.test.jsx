import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CallStrip from './CallStrip'

function makeCall(overrides) {
  return {
    callId: 'c', vm: 'llm', seq: 1, ts0: 1000, ts1: null, status: 'pending',
    sent: { summary: 's', detail: {} }, received: null,
    ...overrides,
  }
}

describe('CallStrip', () => {
  it('rend un carré par appel, dans la rangée de sa VM', () => {
    const callsByVm = {
      llm: [makeCall({ callId: 'a', seq: 1, ts0: 1000 })],
      mcp: [makeCall({ callId: 'b', vm: 'mcp', seq: 2, ts0: 1001 })],
    }
    render(<CallStrip callsByVm={callsByVm} />)
    expect(screen.getByTestId('call-square-llm')).toHaveTextContent('1')
    expect(screen.getByTestId('call-square-mcp')).toHaveTextContent('2')
  })

  it('classe les carrés selon leur statut', () => {
    const callsByVm = { llm: [makeCall({ callId: 'a', status: 'error' })], mcp: [] }
    render(<CallStrip callsByVm={callsByVm} />)
    expect(screen.getByTestId('call-square-llm')).toHaveClass('call-square-error')
  })

  it('ordonne les colonnes par ts0 croissant quel que soit l\'ordre reçu', () => {
    const callsByVm = {
      llm: [makeCall({ callId: 'later', seq: 2, ts0: 2000 })],
      mcp: [makeCall({ callId: 'earlier', vm: 'mcp', seq: 1, ts0: 1000 })],
    }
    render(<CallStrip callsByVm={callsByVm} />)
    const squares = screen.getAllByRole('button')
    expect(squares[0]).toHaveTextContent('1')
    expect(squares[1]).toHaveTextContent('2')
  })

  it('un clic sélectionne l\'appel et ouvre le détail', async () => {
    const callsByVm = { llm: [makeCall({ callId: 'a', status: 'done', ts1: 1005, received: { summary: 'r', detail: {} } })], mcp: [] }
    render(<CallStrip callsByVm={callsByVm} />)
    await userEvent.click(screen.getByTestId('call-square-llm'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('un second clic sur le même carré referme le détail', async () => {
    const callsByVm = { llm: [makeCall({ callId: 'a', status: 'done', ts1: 1005, received: { summary: 'r', detail: {} } })], mcp: [] }
    render(<CallStrip callsByVm={callsByVm} />)
    await userEvent.click(screen.getByTestId('call-square-llm'))
    await userEvent.click(screen.getByTestId('call-square-llm'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('un clic hors de la bande referme le détail', async () => {
    const callsByVm = { llm: [makeCall({ callId: 'a', status: 'done', ts1: 1005, received: { summary: 'r', detail: {} } })], mcp: [] }
    render(
      <div>
        <CallStrip callsByVm={callsByVm} />
        <button type="button">outside</button>
      </div>,
    )
    await userEvent.click(screen.getByTestId('call-square-llm'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await userEvent.click(screen.getByText('outside'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
