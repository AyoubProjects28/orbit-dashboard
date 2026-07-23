// Envoie un message au backend et renvoie la réponse accompagnée des
// statistiques du tour (tokens / latences / coût).
//
// `provider` est l'identifiant de cible choisi dans le sélecteur (par ex.
// « ollama:qwen2.5:3b-instruct »). Omis, le backend retombe sur sa cible par défaut.

export async function sendChatMessage(message, { history = [], provider } = {}) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(provider ? { message, history, provider } : { message, history }),
  })
  if (!response.ok) {
    throw new Error(`Failed to send message: ${response.status}`)
  }
  return response.json()
}
