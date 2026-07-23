import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import InfraTab from './InfraTab'

function emptyBuffer() {
  return { cpu: [], mem: [], rx: [], tx: [], cores: [] }
}

const refs = {
  buffersRef: { current: { llm: emptyBuffer(), mcp: emptyBuffer() } },
  samplingRef: { current: null },
}
const latest = {
  llm: { t: 1, cpu: 40, mem: 60, rx: 0, tx: 0, load: 1, cores: [40, 40, 40, 40] },
  mcp: { t: 1, cpu: 5, mem: 24, rx: 0, tx: 0, load: 0.1, cores: [5, 5] },
}

describe('InfraTab', () => {
  it('rend une carte par VM', () => {
    render(<InfraTab latest={latest} online={{ llm: true, mcp: true }} lastSampling={null} {...refs} />)
    expect(screen.getByText(/LLM-TEST01/)).toBeInTheDocument()
    expect(screen.getByText(/MCP-TEST01/)).toBeInTheDocument()
  })

  it('invite à envoyer un prompt tant qu\'aucun carottage n\'a eu lieu', () => {
    render(<InfraTab latest={latest} online={{ llm: true, mcp: true }} lastSampling={null} {...refs} />)
    expect(screen.getByTestId('sampling-summary')).toHaveTextContent(/prompt/i)
  })

  it('résume le dernier carottage avec la hausse relative de CPU', () => {
    const lastSampling = {
      window_s: 12.4,
      vms: {
        llm: { cpu_avg: 80, cpu_peak: 94, cpu_base: 10, mem_avg: 71, cores: 4, cpu_seconds: 12.4 },
        mcp: { cpu_avg: 22, cpu_peak: 31, cpu_base: 4, mem_avg: 24, cores: 2, cpu_seconds: 1.1 },
      },
    }
    render(<InfraTab latest={latest} online={{ llm: true, mcp: true }} lastSampling={lastSampling} {...refs} />)
    const summary = screen.getByTestId('sampling-summary')
    expect(summary).toHaveTextContent('12.4 s')
    expect(summary).toHaveTextContent('+700%')
    expect(summary).toHaveTextContent('12.4 CPU·s')
  })

  it('affiche la valeur absolue quand la baseline est trop basse pour un ratio', () => {
    const lastSampling = {
      window_s: 3,
      vms: {
        llm: { cpu_avg: 60, cpu_peak: 70, cpu_base: 0.1, mem_avg: 60, cores: 4, cpu_seconds: 7.2 },
        mcp: { cpu_avg: 2, cpu_peak: 3, cpu_base: 0.1, mem_avg: 22, cores: 2, cpu_seconds: 0.1 },
      },
    }
    render(<InfraTab latest={latest} online={{ llm: true, mcp: true }} lastSampling={lastSampling} {...refs} />)
    expect(screen.getByTestId('sampling-summary')).toHaveTextContent('baseline too low')
  })
})
