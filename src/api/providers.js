// Liste des cibles LLM proposées dans le sélecteur du chat.
// Le backend renvoie un item par modèle Ollama installé, plus les cibles API
// (Claude, Lambda) avec leur disponibilité — voir nasa-back/providers.js.

export async function fetchProviders() {
  const response = await fetch('/api/providers', { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Failed to fetch providers: ${response.status}`)
  }
  const data = await response.json()
  return data.providers ?? []
}
