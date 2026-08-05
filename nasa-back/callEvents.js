// Bus d'événements pour les appels LLM/MCP en direct — voir
// docs/superpowers/specs/2026-07-30-call-pins-design.md.
//
// Purement pub/sub, sans historique : si aucun client SSE n'est connecté,
// emitCall() ne fait rien (EventEmitter sans listener), donc zéro coût quand
// le dashboard n'est pas ouvert.
import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'

const emitter = new EventEmitter()
const MAX_DETAIL_CHARS = 10000

export function truncateDetail(detail) {
  const json = JSON.stringify(detail)
  if (json == null || json.length <= MAX_DETAIL_CHARS) return detail
  return { truncated: true, preview: json.slice(0, MAX_DETAIL_CHARS) }
}

export function emitCall(event) {
  emitter.emit('call', {
    id: randomUUID(),
    ...event,
    detail: truncateDetail(event.detail),
  })
}

export function onCall(listener) {
  emitter.on('call', listener)
}

export function offCall(listener) {
  emitter.off('call', listener)
}

// Enveloppe un appel réseau (LLM ou MCP) : émet "sent" avant, puis toujours
// "received" ou "error" après (jamais un "sent" orphelin, voir spec §Gestion
// des erreurs) ; repropage l'erreur d'origine à l'appelant.
export async function traceCall({ vm, kind, sentSummary, sentDetail, describeResult }, run) {
  emitCall({ vm, kind, direction: 'sent', ts: Date.now() / 1000, summary: sentSummary, detail: sentDetail })
  try {
    const result = await run()
    const { summary, detail } = describeResult(result)
    emitCall({ vm, kind, direction: 'received', ts: Date.now() / 1000, summary, detail })
    return result
  } catch (err) {
    emitCall({ vm, kind, direction: 'error', ts: Date.now() / 1000, summary: `✗ ${err.message}`, detail: { error: err.message } })
    throw err
  }
}
