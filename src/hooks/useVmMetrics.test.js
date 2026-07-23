import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useVmMetrics, VMS, WINDOW_S, BASELINE_S } from './useVmMetrics'

function agentPayload(cpu, mem) {
  return {
    cpu_percent: cpu,
    mem_percent: mem,
    mem_used_bytes: 1000,
    mem_total_bytes: 2000,
    net_rx_bps: 10,
    net_tx_bps: 20,
    load_avg: [1.5, 1.2, 1.0],
    per_cpu: [cpu, cpu, cpu, cpu],
  }
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function mockOk(body) {
  globalThis.fetch.mockResolvedValue({ ok: true, json: async () => body })
}

describe('useVmMetrics — constantes', () => {
  it('expose les constantes de carottage reprises de monitor.html', () => {
    expect(VMS).toEqual(['llm', 'mcp'])
    expect(WINDOW_S).toBe(60)
    expect(BASELINE_S).toBe(15)
  })
})

describe('useVmMetrics — sondage', () => {
  it('marque les deux VM en ligne et remplit le tampon quand les agents répondent', async () => {
    mockOk({ llm: agentPayload(42, 61), mcp: agentPayload(7, 23) })
    const { result } = renderHook(() => useVmMetrics())

    await waitFor(() => expect(result.current.online.llm).toBe(true))
    expect(result.current.online.mcp).toBe(true)
    expect(result.current.latest.llm.cpu).toBe(42)
    expect(result.current.buffersRef.current.llm.cpu.length).toBeGreaterThan(0)
  })

  it('bascule sur le mock et marque hors ligne quand un agent renvoie une erreur', async () => {
    mockOk({ llm: { error: 'ECONNREFUSED' }, mcp: agentPayload(7, 23) })
    const { result } = renderHook(() => useVmMetrics())

    await waitFor(() => expect(result.current.latest.llm).not.toBeNull())
    expect(result.current.online.llm).toBe(false)
    expect(result.current.online.mcp).toBe(true)
    // le mock alimente quand même le tampon, pour que les courbes ne se figent pas
    expect(result.current.buffersRef.current.llm.cpu.length).toBeGreaterThan(0)
  })

  it('bascule sur le mock pour les deux VM quand le backend est injoignable', async () => {
    globalThis.fetch.mockRejectedValue(new Error('network down'))
    const { result } = renderHook(() => useVmMetrics())

    await waitFor(() => expect(result.current.latest.llm).not.toBeNull())
    expect(result.current.online.llm).toBe(false)
    expect(result.current.online.mcp).toBe(false)
  })
})

describe('useVmMetrics — carottage', () => {
  it('renvoie un résumé par VM entre startSampling et endSampling', async () => {
    mockOk({ llm: agentPayload(80, 70), mcp: agentPayload(20, 25) })
    const { result } = renderHook(() => useVmMetrics())
    await waitFor(() => expect(result.current.online.llm).toBe(true))

    act(() => result.current.startSampling())
    expect(result.current.samplingRef.current.active).toBe(true)

    let summary
    act(() => { summary = result.current.endSampling() })

    expect(summary).not.toBeNull()
    expect(summary.vms.llm).toHaveProperty('cpu_avg')
    expect(summary.vms.llm).toHaveProperty('cpu_seconds')
    expect(summary.vms.mcp).toHaveProperty('cpu_peak')
    expect(result.current.samplingRef.current.active).toBe(false)
    expect(result.current.lastSampling).toEqual(summary)
  })

  it('renvoie null si endSampling est appelé sans carottage en cours', async () => {
    mockOk({ llm: agentPayload(10, 60), mcp: agentPayload(5, 22) })
    const { result } = renderHook(() => useVmMetrics())
    await waitFor(() => expect(result.current.online.llm).toBe(true))

    let summary
    act(() => { summary = result.current.endSampling() })
    expect(summary).toBeNull()
  })

  it('efface le résumé précédent au démarrage d\'un nouveau carottage', async () => {
    mockOk({ llm: agentPayload(10, 60), mcp: agentPayload(5, 22) })
    const { result } = renderHook(() => useVmMetrics())
    await waitFor(() => expect(result.current.online.llm).toBe(true))

    act(() => result.current.startSampling())
    act(() => { result.current.endSampling() })
    expect(result.current.lastSampling).not.toBeNull()

    act(() => result.current.startSampling())
    expect(result.current.lastSampling).toBeNull()
  })
})

describe('useVmMetrics — cycle de vie', () => {
  it('arrête de sonder après démontage', async () => {
    mockOk({ llm: agentPayload(10, 60), mcp: agentPayload(5, 22) })
    const { result, unmount } = renderHook(() => useVmMetrics())
    await waitFor(() => expect(result.current.online.llm).toBe(true))

    const callsBefore = globalThis.fetch.mock.calls.length
    unmount()
    await new Promise((resolve) => setTimeout(resolve, 1200))
    expect(globalThis.fetch.mock.calls.length).toBe(callsBefore)
  })
})
