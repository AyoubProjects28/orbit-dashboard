// Envoie un message au backend et renvoie la réponse accompagnée des
// statistiques du tour (tokens / latences / coût) et de son `turn_id`
// (nécessaire pour poster le carottage ensuite, voir api/logs.js).
//
// `provider` est l'identifiant de cible choisi dans le sélecteur (par ex.
// « ollama:qwen2.5:3b-instruct »). Omis, le backend retombe sur sa cible par défaut.

export async function sendChatMessage(message, { history = [], provider, sessionId, sessionName } = {}) {
  const body = { message, history }
  if (provider) body.provider = provider
  if (sessionId) body.session_id = sessionId
  if (sessionName) body.session_name = sessionName

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    throw new Error(`Failed to send message: ${response.status}`)
  }
  return response.json()
}
