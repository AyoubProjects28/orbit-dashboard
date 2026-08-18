import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import InfraTab from './InfraTab'

function emptyBuffer() {
  return { cpu: [], mem: [], rx: [], tx: [], cores: [] }
}

const refs = {
  buffersRef: { current: { llm: emptyBuffer(), web: emptyBuffer() } },
  samplingRef: { current: null },
}
const latest = {
  llm: { t: 1, cpu: 40, mem: 60, rx: 0, tx: 0, load: 1, cores: [40, 40, 40, 40] },
  web: { t: 1, cpu: 5, mem: 24, rx: 0, tx: 0, load: 0.1, cores: [5, 5, 5, 5] },
}

describe('InfraTab', () => {
  it('rend une carte par VM', () => {
    render(<InfraTab latest={latest} online={{ llm: true, web: true }} {...refs} />)
    expect(screen.getByText(/LLM-TEST01/)).toBeInTheDocument()
    expect(screen.getByText(/WEB-TEST01/)).toBeInTheDocument()
  })

  it('affiche un appel de service mcp sur la carte web, sa VM physique', () => {
    const call = {
      callId: 'c1', vm: 'mcp', seq: 1, ts0: Date.now() / 1000, ts1: null, status: 'pending',
      sent: { summary: '→ x', detail: {} }, received: null,
    }
    render(
      <InfraTab
        latest={latest}
        online={{ llm: true, web: true }}
        callsByVm={{ llm: [], mcp: [call] }}
        {...refs}
      />,
    )
    const webCard = screen.getByText(/WEB-TEST01/).closest('article')
    expect(webCard.querySelector('[data-testid="call-pin-sent"]')).toBeInTheDocument()
  })
})
