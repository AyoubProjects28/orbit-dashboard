// Onglet Logs : lecture des sessions journalisées + post du carottage d'un
// tour une fois la mesure terminée côté front (voir hooks/useVmMetrics.js).

export async function fetchLogs() {
  const response = await fetch('/api/logs', { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Failed to fetch logs: ${response.status}`)
  }
  return response.json()
}

export async function postTurnSampling(turnId, sampling) {
  const response = await fetch(`/api/turns/${turnId}/sampling`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sampling),
  })
  if (!response.ok) {
    throw new Error(`Failed to post sampling: ${response.status}`)
  }
}
