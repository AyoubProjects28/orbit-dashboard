import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CallPins from './CallPins'

const now = Date.now() / 1000
const events = [
  { id: '1', vm: 'mcp', kind: 'mcp', direction: 'sent', ts: now - 5, summary: '→ get_temperature({})', detail: { tool: 'get_temperature' } },
  { id: '2', vm: 'mcp', kind: 'mcp', direction: 'received', ts: now - 3, summary: '← get_temperature (12 bytes)', detail: { result: 'ok' } },
  { id: '3', vm: 'mcp', kind: 'mcp', direction: 'error', ts: now - 90, summary: '✗ timeout', detail: { error: 'timeout' } },
]

describe('CallPins', () => {
  it('ne rend que les events dans la fenêtre de 60 s', () => {
    render(<CallPins events={events} />)
    expect(screen.getByTestId('call-pin-sent')).toBeInTheDocument()
    expect(screen.getByTestId('call-pin-received')).toBeInTheDocument()
    expect(screen.queryByTestId('call-pin-error')).not.toBeInTheDocument()
  })

  it('affiche le résumé au survol', async () => {
    render(<CallPins events={events} />)
    await userEvent.hover(screen.getByTestId('call-pin-sent'))
    expect(screen.getByText(/get_temperature/)).toBeInTheDocument()
  })

  it('affiche le JSON complet après clic sur "View payload"', async () => {
    render(<CallPins events={events} />)
    await userEvent.hover(screen.getByTestId('call-pin-sent'))
    await userEvent.click(screen.getByRole('button', { name: /View payload/i }))
    expect(screen.getByText(/"tool": "get_temperature"/)).toBeInTheDocument()
  })

  it('ne plante pas sans events', () => {
    render(<CallPins />)
    expect(screen.queryByTestId('call-pin-sent')).not.toBeInTheDocument()
  })
})
