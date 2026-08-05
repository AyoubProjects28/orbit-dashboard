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

  it('range chaque event reçu sous sa VM', () => {
    const { result } = renderHook(() => useCallEvents())
    act(() => {
      emit(FakeEventSource.instances[0], { id: '1', vm: 'mcp', kind: 'mcp', direction: 'sent', ts: Date.now() / 1000, summary: 'x', detail: {} })
    })
    expect(result.current.eventsByVm.mcp).toHaveLength(1)
    expect(result.current.eventsByVm.llm).toHaveLength(0)
  })

  it('élague les events sortis de la fenêtre de 60 s à la réception d\'un nouvel event', () => {
    const { result } = renderHook(() => useCallEvents())
    const now = Date.now() / 1000
    act(() => {
      emit(FakeEventSource.instances[0], { id: 'old', vm: 'llm', kind: 'llm', direction: 'sent', ts: now - 120, summary: 'old', detail: {} })
    })
    expect(result.current.eventsByVm.llm).toHaveLength(1)
    act(() => {
      emit(FakeEventSource.instances[0], { id: 'new', vm: 'llm', kind: 'llm', direction: 'sent', ts: now, summary: 'new', detail: {} })
    })
    expect(result.current.eventsByVm.llm.map((e) => e.id)).toEqual(['new'])
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
    expect(result.current.eventsByVm).toEqual({ llm: [], mcp: [] })
  })
})
