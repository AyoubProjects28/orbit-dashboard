import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CallPins from './CallPins'

const now = Date.now() / 1000
const calls = [
  {
    callId: 'c1', vm: 'mcp', seq: 1, ts0: now - 5, ts1: now - 3, status: 'done',
    sent: { summary: '→ get_temperature({})', detail: { tool: 'get_temperature' } },
    received: { summary: '← get_temperature (12 bytes)', detail: { result: 'ok' } },
  },
  {
    callId: 'c2', vm: 'mcp', seq: 2, ts0: now - 90, ts1: null, status: 'pending',
    sent: { summary: '→ old', detail: {} }, received: null,
  },
]

describe('CallPins', () => {
  it('rend deux pastilles portant le même numéro pour un appel terminé', () => {
    render(<CallPins calls={calls} />)
    const sent = screen.getByTestId('call-pin-sent')
    const received = screen.getByTestId('call-pin-received')
    expect(sent).toHaveTextContent('1')
    expect(received).toHaveTextContent('1')
  })

  it('ne rend que les appels dans la fenêtre de 60 s', () => {
    render(<CallPins calls={calls} />)
    expect(screen.getAllByTestId(/call-pin-/)).toHaveLength(2)
  })

  it('n\'affiche aucune infobulle au survol', async () => {
    render(<CallPins calls={calls} />)
    await userEvent.hover(screen.getByTestId('call-pin-sent'))
    expect(screen.queryByText(/get_temperature/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /view payload/i })).not.toBeInTheDocument()
  })

  it('signale le survol via onHighlightCall', async () => {
    const onHighlightCall = vi.fn()
    render(<CallPins calls={calls} onHighlightCall={onHighlightCall} />)
    await userEvent.hover(screen.getByTestId('call-pin-sent'))
    expect(onHighlightCall).toHaveBeenCalledWith('c1')
    await userEvent.unhover(screen.getByTestId('call-pin-sent'))
    expect(onHighlightCall).toHaveBeenCalledWith(null)
  })

  it('applique la classe de surlignage quand highlightedCallId correspond', () => {
    render(<CallPins calls={calls} highlightedCallId="c1" />)
    expect(screen.getByTestId('call-pin-sent')).toHaveClass('call-pin-highlighted')
  })

  it('ne plante pas sans calls', () => {
    render(<CallPins />)
    expect(screen.queryByTestId('call-pin-sent')).not.toBeInTheDocument()
  })
})
