// Bus d'événements pour les appels LLM/MCP en direct — voir
// docs/superpowers/specs/2026-08-04-call-pins-v2-design.md (remplace la v1).
//
// Purement pub/sub, sans historique : si aucun client SSE n'est connecté,
// emitCall() ne fait rien (EventEmitter sans listener), donc zéro coût quand
// le dashboard n'est pas ouvert.
import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'

const emitter = new EventEmitter()
const MAX_DETAIL_CHARS = 10000

// Contexte async du tour de chat courant — voir index.js `/api/chat`, qui
// enveloppe le dispatch avec `turnContext.run({ turnId }, ...)`. Permet à
// emitCall() de savoir de quel tour un event provient sans faire traverser
// le turnId par paramètre à travers providers.js -> providerOllama.js /
// mcpClient.js.
export const turnContext = new AsyncLocalStorage()

export function truncateDetail(detail) {
  const json = JSON.stringify(detail)
  if (json == null || json.length <= MAX_DETAIL_CHARS) return detail
  return { truncated: true, preview: json.slice(0, MAX_DETAIL_CHARS) }
}

export function emitCall(event) {
  emitter.emit('call', {
    id: randomUUID(),
    turnId: turnContext.getStore()?.turnId ?? null,
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
// des erreurs) ; repropage l'erreur d'origine à l'appelant. `callId` est
// généré une fois par appel et partagé par les 2-3 events qu'il émet, pour
// que le frontend puisse relier l'envoi à sa réponse (v2 §1.1).
export async function traceCall({ vm, kind, sentSummary, sentDetail, describeResult }, run) {
  const callId = randomUUID()
  emitCall({ callId, vm, kind, direction: 'sent', ts: Date.now() / 1000, summary: sentSummary, detail: sentDetail })
  try {
    const result = await run()
    const { summary, detail } = describeResult(result)
    emitCall({ callId, vm, kind, direction: 'received', ts: Date.now() / 1000, summary, detail })
    return result
  } catch (err) {
    emitCall({ callId, vm, kind, direction: 'error', ts: Date.now() / 1000, summary: `✗ ${err.message}`, detail: { error: err.message } })
    throw err
  }
}
