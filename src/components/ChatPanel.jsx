import { useState } from 'react'
import { sendChatMessage } from '../api/chat'

function formatCost(usd) {
  return usd < 0.01 ? `$${usd.toFixed(6)}` : `$${usd.toFixed(2)}`
}

// Sends messages to /api/chat and, after each successful reply, calls
// onMessageSent() so App.jsx knows to refresh the dashboard. ChatPanel
// itself knows nothing about metrics beyond that one callback.
function ChatPanel({ onMessageSent }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(event) {
    event.preventDefault()
    const text = input.trim()
    if (!text || sending) return

    const history = messages.map(({ role, content }) => ({ role, content }))
    setMessages((prev) => [...prev, { role: 'user', content: text }])
    setInput('')
    setSending(true)
    setError(null)

    try {
      const { reply, turnMetrics } = await sendChatMessage(text, history)
      setMessages((prev) => [...prev, { role: 'assistant', content: reply, turnMetrics }])
      onMessageSent?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="chat-panel" aria-label="Chat">
      <h2>Chat</h2>
      <div className="chat-messages">
        {messages.length === 0 && (
          <p className="chat-empty">Send a message to see it drive the metrics on the right.</p>
        )}
        {messages.map((message, index) => (
          <div key={index} className={`chat-bubble chat-bubble-${message.role}`}>
            <p>{message.content}</p>
            {message.turnMetrics && (
              <p className="chat-turn-stats">
                {message.turnMetrics.total_tokens} tokens · {message.turnMetrics.latency_ms} ms ·{' '}
                {formatCost(message.turnMetrics.cost_usd)}
              </p>
            )}
          </div>
        ))}
        {sending && <div className="chat-bubble chat-bubble-assistant chat-pending">…</div>}
      </div>

      {error && <p className="status status-error">{error}</p>}

      <form className="chat-input-row" onSubmit={handleSubmit}>
        <input
          className="chat-input"
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask something..."
          disabled={sending}
        />
        <button type="submit" disabled={sending || !input.trim()}>
          Send
        </button>
      </form>
    </section>
  )
}

export default ChatPanel
