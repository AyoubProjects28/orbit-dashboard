import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import VmCard, { VM_META } from './VmCard'

const refs = {
  buffersRef: { current: { llm: { cpu: [], mem: [], rx: [], tx: [], cores: [] } } },
  samplingRef: { current: null },
}

const sample = {
  t: 1000, cpu: 42.4, mem: 61.6, memUsed: 0, memTotal: 0,
  rx: 2048, tx: 1048576, load: 1.53, cores: [40, 45, 38, 47],
}

describe('VmCard', () => {
  it('affiche le nom, le rôle et l\'IP de la VM', () => {
    render(<VmCard vm="llm" sample={sample} online {...refs} />)
    expect(screen.getByText(/LLM-TEST01/)).toBeInTheDocument()
    expect(screen.getByText(VM_META.llm.ip)).toBeInTheDocument()
  })

  it('affiche les lectures arrondies et le réseau formaté', () => {
    render(<VmCard vm="llm" sample={sample} online {...refs} />)
    expect(screen.getByTestId('reading-cpu')).toHaveTextContent('42 %')
    expect(screen.getByTestId('reading-mem')).toHaveTextContent('62 %')
    expect(screen.getByTestId('reading-load')).toHaveTextContent('1.53')
    expect(screen.getByTestId('reading-net')).toHaveTextContent('2.0 Ko/s')
    expect(screen.getByTestId('reading-net')).toHaveTextContent('1.0 Mo/s')
  })

  it('rend une barre par cœur', () => {
    render(<VmCard vm="llm" sample={sample} online {...refs} />)
    expect(screen.getAllByTestId('core-bar')).toHaveLength(4)
  })

  it('affiche des tirets tant qu\'aucun échantillon n\'est arrivé', () => {
    render(<VmCard vm="llm" sample={null} online={false} {...refs} />)
    expect(screen.getByTestId('reading-cpu')).toHaveTextContent('–')
  })

  it('reflète l\'état hors ligne sur la pastille', () => {
    const { rerender } = render(<VmCard vm="llm" sample={sample} online {...refs} />)
    expect(screen.getByTestId('vm-dot')).toHaveClass('dot-on')
    rerender(<VmCard vm="llm" sample={sample} online={false} {...refs} />)
    expect(screen.getByTestId('vm-dot')).toHaveClass('dot-off')
  })
})
