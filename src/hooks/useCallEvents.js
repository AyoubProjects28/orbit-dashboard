// Abonnement live aux events LLM/MCP (voir nasa-back/callEvents.js) via SSE.
// Additif à useVmMetrics : mêmes VM ('llm'/'mcp'), même fenêtre glissante de
// 60 s, mais en state (pas en ref) — les events sont rares comparé aux 60 fps
// du canvas, donc un re-render par event est sans coût.
import { useEffect, useState } from 'react'
import { WINDOW_S } from './useVmMetrics'

function emptyEventsByVm() {
  return { llm: [], mcp: [] }
}

export function useCallEvents() {
  const [eventsByVm, setEventsByVm] = useState(emptyEventsByVm)

  useEffect(() => {
    const source = new EventSource('/api/call-events')
    source.onmessage = (message) => {
      let event
      try {
        event = JSON.parse(message.data)
      } catch {
        return
      }
      if (!event?.vm) return
      setEventsByVm((prev) => {
        const cutoff = Date.now() / 1000 - WINDOW_S
        const filtered = (prev[event.vm] ?? []).filter((e) => e.ts >= cutoff)
        const next = [...filtered, event]
        return { ...prev, [event.vm]: next }
      })
    }
    return () => source.close()
  }, [])

  return { eventsByVm }
}
