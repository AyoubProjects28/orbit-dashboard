import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

const METRICS = {
  timestamp: '2026-07-23T12:00:00.000Z',
  hardware: { gpu: [], cpu_pct: 30, ram_used_mb: 9000, ram_total_mb: 32000 },
  network: { latency_ms: 0, throughput_rps: 6.2 },
  llm: { latency_ms: 0, overhead_ms: 0, calls_last_turn: 0, calls_total: 0 },
  tokens: { prompt: 0, completion: 0, total: 0 },
  cost: { per_request_usd: 0, total_usd: 0, currency: 'USD' },
  series: { latency_ms: [], cost_per_request_usd: [] },
}

beforeEach(() => {
  globalThis.fetch = vi.fn(async (url) => {
    const target = String(url)
    if (target.includes('/api/vm-metrics')) return { ok: true, json: async () => ({}) }
    if (target.includes('/api/providers')) return { ok: true, json: async () => ({ providers: [] }) }
    if (target.includes('/api/metrics')) return { ok: true, json: async () => METRICS }
    return { ok: true, json: async () => ({}) }
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('App', () => {
  it('affiche le chat et les trois onglets', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByRole('region', { name: 'Chat' })).toBeInTheDocument())
    expect(screen.getByRole('tab', { name: 'Infra' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Usage' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Logs' })).toBeInTheDocument()
  })

  it('ouvre sur l\'onglet Infra', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByText(/LLM-TEST01/)).toBeInTheDocument())
    expect(screen.getByRole('tab', { name: 'Infra' })).toHaveAttribute('aria-selected', 'true')
  })

  it('bascule sur Usage sans démonter le chat', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByText(/LLM-TEST01/)).toBeInTheDocument())

    await userEvent.click(screen.getByRole('tab', { name: 'Usage' }))
    // waitFor : /api/metrics peut ne pas encore avoir résolu au moment du clic,
    // auquel cas l'onglet affiche « Loading metrics… » une frame.
    await waitFor(() => expect(screen.getByRole('region', { name: 'Token usage' })).toBeInTheDocument())
    expect(screen.queryByText(/LLM-TEST01/)).not.toBeInTheDocument()
    // le chat reste monté quel que soit l'onglet
    expect(screen.getByRole('region', { name: 'Chat' })).toBeInTheDocument()
  })

  it('bascule sur Logs et y affiche le placeholder d\'étape 3', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByText(/LLM-TEST01/)).toBeInTheDocument())

    await userEvent.click(screen.getByRole('tab', { name: 'Logs' }))
    expect(screen.getByRole('region', { name: 'Session history' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Chat' })).toBeInTheDocument()
  })
})
