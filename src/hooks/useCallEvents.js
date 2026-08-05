// Abonnement live aux events LLM/MCP (voir nasa-back/callEvents.js) via SSE.
// Regroupe les events par callId en appels (v2 §1.2) : chaque appel a un
// numéro (seq) attribué une fois pour toutes à sa première apparition, un
// statut qui évolue de 'pending' à 'done'/'error', et les deux faces
// sent/received pour l'overlay de détail. L'agrégation vit dans un ref (une
// Map), pas dans le state, pour ne pas dépendre d'une closure React d'un
// render à l'autre ; seule sa projection en tableau part en state.
import { useEffect, useRef, useState } from 'react'
import { WINDOW_S } from './useVmMetrics'

function emptyCallsByVm() {
  return { llm: [], mcp: [] }
}

export function useCallEvents() {
  const [callsByVm, setCallsByVm] = useState(emptyCallsByVm)
  const callsRef = useRef(new Map())
  const nextSeqRef = useRef(1)

  useEffect(() => {
    const source = new EventSource('/api/call-events')
    source.onmessage = (message) => {
      let event
      try {
        event = JSON.parse(message.data)
      } catch {
        return
      }
      if (!event?.vm || !event?.callId) return

      const calls = callsRef.current
      const existing = calls.get(event.callId)

      if (event.direction === 'sent') {
        if (!existing) {
          calls.set(event.callId, {
            callId: event.callId,
            vm: event.vm,
            seq: nextSeqRef.current++,
            ts0: event.ts,
            ts1: null,
            status: 'pending',
            sent: { summary: event.summary, detail: event.detail },
            received: null,
          })
        }
      } else if (existing && (event.direction === 'received' || event.direction === 'error')) {
        calls.set(event.callId, {
          ...existing,
          ts1: event.ts,
          status: event.direction === 'error' ? 'error' : 'done',
          received: { summary: event.summary, detail: event.detail },
        })
      }

      // Éviction sur ts0 (instant d'envoi), pas sur la dernière activité —
      // sinon un appel et ses deux pastilles ne s'effaceraient pas d'un bloc.
      const cutoff = Date.now() / 1000 - WINDOW_S
      for (const [callId, call] of calls) {
        if (call.ts0 < cutoff) calls.delete(callId)
      }

      const next = emptyCallsByVm()
      for (const call of calls.values()) next[call.vm].push(call)
      for (const vm of Object.keys(next)) next[vm].sort((a, b) => a.ts0 - b.ts0)
      setCallsByVm(next)
    }
    return () => source.close()
  }, [])

  return { callsByVm }
}
