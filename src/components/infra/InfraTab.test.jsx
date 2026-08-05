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
    render(<InfraTab latest={latest} online={{ llm: true, mcp: true }} {...refs} />)
    expect(screen.getByText(/LLM-TEST01/)).toBeInTheDocument()
    expect(screen.getByText(/MCP-TEST01/)).toBeInTheDocument()
  })
})
