// Récupère les métriques des agents psutil, agrégées côté backend.
// Le backend proxifie les deux agents (LLM + MCP) pour que le navigateur
// reste en même origine — voir nasa-back/index.js, route /api/vm-metrics.

export async function fetchVmMetrics() {
  const response = await fetch('/api/vm-metrics', { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Failed to fetch VM metrics: ${response.status}`)
  }
  return response.json()
}
