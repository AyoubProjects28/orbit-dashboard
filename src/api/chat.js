// Sends one chat message (plus prior history) to the backend and returns
// the reply along with that turn's own tokens/latency/cost stats.

export async function sendChatMessage(message, history) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history }),
  })
  if (!response.ok) {
    throw new Error(`Failed to send message: ${response.status}`)
  }
  return response.json()
}
