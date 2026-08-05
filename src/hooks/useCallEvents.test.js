import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCallEvents } from './useCallEvents'

class FakeEventSource {
  constructor(url) {
    this.url = url
    FakeEventSource.instances.push(this)
  }
  close() { this.closed = true }
}
FakeEventSource.instances = []

beforeEach(() => {
  FakeEventSource.instances = []
  vi.stubGlobal('EventSource', FakeEventSource)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function emit(instance, event) {
  instance.onmessage({ data: JSON.stringify(event) })
}

describe('useCallEvents', () => {
  it('ouvre une connexion SSE vers /api/call-events au montage', () => {
    renderHook(() => useCallEvents())
    expect(FakeEventSource.instances).toHaveLength(1)
    expect(FakeEventSource.instances[0].url).toBe('/api/call-events')
  })

  it('un event sent seul crée un appel pending sous sa VM', () => {
    const { result } = renderHook(() => useCallEvents())
    const now = Date.now() / 1000
    act(() => {
      emit(FakeEventSource.instances[0], { vm: 'mcp', callId: 'c1', direction: 'sent', ts: now, summary: '→ x', detail: {} })
    })
    expect(result.current.callsByVm.mcp).toHaveLength(1)
    expect(result.current.callsByVm.mcp[0]).toMatchObject({ callId: 'c1', seq: 1, status: 'pending', ts1: null })
    expect(result.current.callsByVm.llm).toHaveLength(0)
  })

  it('un event received complète l\'appel existant sans le dupliquer', () => {
    const { result } = renderHook(() => useCallEvents())
    const now = Date.now() / 1000
    act(() => {
      emit(FakeEventSource.instances[0], { vm: 'mcp', callId: 'c1', direction: 'sent', ts: now, summary: '→ x', detail: {} })
    })
    act(() => {
      emit(FakeEventSource.instances[0], { vm: 'mcp', callId: 'c1', direction: 'received', ts: now + 1, summary: '← y', detail: {} })
    })
    expect(result.current.callsByVm.mcp).toHaveLength(1)
    const call = result.current.callsByVm.mcp[0]
    expect(call.status).toBe('done')
    expect(call.received.summary).toBe('← y')
    expect(call.seq).toBe(1)
  })

  it('un event error marque l\'appel en erreur', () => {
    const { result } = renderHook(() => useCallEvents())
    const now = Date.now() / 1000
    act(() => {
      emit(FakeEventSource.instances[0], { vm: 'llm', callId: 'c1', direction: 'sent', ts: now, summary: '→ x', detail: {} })
      emit(FakeEventSource.instances[0], { vm: 'llm', callId: 'c1', direction: 'error', ts: now + 1, summary: '✗ boom', detail: {} })
    })
    expect(result.current.callsByVm.llm[0].status).toBe('error')
  })

  it('attribue seq de façon monotone et le garde stable après expiration d\'un appel antérieur', () => {
    const { result } = renderHook(() => useCallEvents())
    const now = Date.now() / 1000
    act(() => {
      emit(FakeEventSource.instances[0], { vm: 'llm', callId: 'first', direction: 'sent', ts: now - 65, summary: 'a', detail: {} })
      emit(FakeEventSource.instances[0], { vm: 'llm', callId: 'second', direction: 'sent', ts: now - 1, summary: 'b', detail: {} })
    })
    expect(result.current.callsByVm.llm.map((c) => c.callId)).toEqual(['second'])
    expect(result.current.callsByVm.llm[0].seq).toBe(2)
  })

  it('expire un appel selon ts0, même si une réponse fraîche vient d\'arriver', () => {
    const { result } = renderHook(() => useCallEvents())
    const now = Date.now() / 1000
    act(() => {
      emit(FakeEventSource.instances[0], { vm: 'llm', callId: 'old', direction: 'sent', ts: now - 70, summary: 's', detail: {} })
    })
    expect(result.current.callsByVm.llm).toHaveLength(0)
    act(() => {
      emit(FakeEventSource.instances[0], { vm: 'llm', callId: 'old', direction: 'received', ts: now, summary: 'r', detail: {} })
    })
    expect(result.current.callsByVm.llm).toHaveLength(0)
  })

  it('ferme la connexion au démontage', () => {
    const { unmount } = renderHook(() => useCallEvents())
    const instance = FakeEventSource.instances[0]
    unmount()
    expect(instance.closed).toBe(true)
  })

  it('ignore un message JSON invalide sans planter', () => {
    const { result } = renderHook(() => useCallEvents())
    act(() => {
      FakeEventSource.instances[0].onmessage({ data: 'not json' })
    })
    expect(result.current.callsByVm).toEqual({ llm: [], mcp: [] })
  })

  it('ignore un event sans vm ou sans callId', () => {
    const { result } = renderHook(() => useCallEvents())
    act(() => {
      emit(FakeEventSource.instances[0], { direction: 'sent', ts: Date.now() / 1000, summary: 'x', detail: {} })
    })
    expect(result.current.callsByVm).toEqual({ llm: [], mcp: [] })
  })
})
