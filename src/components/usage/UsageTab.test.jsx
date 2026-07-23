import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import UsageTab from './UsageTab'

const metrics = {
  timestamp: '2026-07-23T12:00:00.000Z',
  hardware: { gpu: [], cpu_pct: 30, ram_used_mb: 9000, ram_total_mb: 32000 },
  network: { latency_ms: 1200, throughput_rps: 6.2 },
  llm: { latency_ms: 900, overhead_ms: 300, calls_last_turn: 2, calls_total: 5 },
  tokens: { prompt: 120, completion: 80, total: 640 },
  cost: { per_request_usd: 0.001, total_usd: 0.0042, currency: 'USD' },
  series: { latency_ms: [['2026-07-23T12:00:00.000Z', 1200]], cost_per_request_usd: [['2026-07-23T12:00:00.000Z', 0.001]] },
}

describe('UsageTab', () => {
  it('rend les panneaux latence, tokens et coût', () => {
    render(<UsageTab data={metrics} />)
    expect(screen.getByRole('region', { name: 'Network latency' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Token usage' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Cost per request' })).toBeInTheDocument()
  })

  it('rend le bandeau de synthèse des coûts', () => {
    render(<UsageTab data={metrics} />)
    expect(screen.getByRole('region', { name: 'Cost summary' })).toBeInTheDocument()
  })
})
