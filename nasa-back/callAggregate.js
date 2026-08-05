// Projette les events collectés pendant un tour en lignes persistables —
// résumés + timings, jamais de payload (voir sessionLog.js et v2 §6.1/§6.3).
// Fonction pure : aucune connaissance de callEvents.js ni du bus, seulement
// des events qu'on lui passe. C'est une projection distincte de celle du
// frontend (useCallEvents.js) : même entrée, forme différente (pas de
// `detail`, `latency_ms` précalculée), dans deux paquets npm séparés — rien
// à partager par import.
export function aggregateCalls(events) {
  const byCallId = new Map()
  const order = []

  for (const event of events) {
    if (!byCallId.has(event.callId)) {
      byCallId.set(event.callId, { callId: event.callId, vm: event.vm, sent: null, received: null, error: null })
      order.push(event.callId)
    }
    const entry = byCallId.get(event.callId)
    if (event.direction === 'sent') entry.sent = event
    else if (event.direction === 'received') entry.received = event
    else if (event.direction === 'error') entry.error = event
  }

  return order.map((callId, index) => {
    const entry = byCallId.get(callId)
    const finishing = entry.received ?? entry.error ?? null
    const ts0 = entry.sent?.ts ?? null
    const ts1 = finishing?.ts ?? null
    return {
      seq: index + 1,
      vm: entry.vm,
      summary_sent: entry.sent?.summary ?? null,
      summary_received: finishing?.summary ?? null,
      ts0,
      ts1,
      latency_ms: ts0 != null && ts1 != null ? Math.round((ts1 - ts0) * 1000) : null,
      status: entry.error ? 'error' : entry.received ? 'done' : 'pending',
    }
  })
}
