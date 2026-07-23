import { useEffect, useState } from 'react'
import { sendChatMessage } from '../api/chat'
import { fetchProviders } from '../api/providers'

const PROVIDER_STORAGE_KEY = 'orbit_provider'

function formatCost(usd) {
  return usd < 0.01 ? `$${usd.toFixed(6)}` : `$${usd.toFixed(2)}`
}

function seconds(ms) {
  return `${((ms ?? 0) / 1000).toFixed(1)} s`
}

// Détail replié sous chaque réponse : la décomposition qu'Antoine a débloquée
// côté Ollama (chargement / évaluation du prompt / génération) plus l'overhead
// MCP + backend. Replié par défaut pour ne pas noyer la conversation.
function TurnMetrics({ metrics }) {
  const [open, setOpen] = useState(false)
  const throughput = metrics.completion_tokens && metrics.gen_ms
    ? `${(metrics.completion_tokens / (metrics.gen_ms / 1000)).toFixed(1)} tok/s`
    : '–'

  return (
    <div className="turn-metrics">
      <button type="button" className="turn-metrics-toggle" onClick={() => setOpen((value) => !value)}>
        {open ? '⌄' : '›'} métriques · {metrics.total_tokens} tokens · {seconds(metrics.latency_ms)} ·{' '}
        {formatCost(metrics.cost_usd)}
      </button>
      {open && (
        <dl className="turn-metrics-detail">
          <div><dt>Prompt / complétion</dt><dd>{metrics.prompt_tokens} / {metrics.completion_tokens}</dd></div>
          <div><dt>Chargement</dt><dd>{seconds(metrics.load_ms)}</dd></div>
          <div><dt>Évaluation du prompt</dt><dd>{seconds(metrics.prompt_eval_ms)}</dd></div>
          <div><dt>Génération</dt><dd>{seconds(metrics.gen_ms)}</dd></div>
          <div><dt>Overhead MCP + backend</dt><dd>{seconds(metrics.overhead_ms)}</dd></div>
          <div><dt>Appels LLM</dt><dd>{metrics.llm_calls}</dd></div>
          <div><dt>Débit</dt><dd>{throughput}</dd></div>
        </dl>
      )}
    </div>
  )
}

// Envoie les messages à /api/chat et encadre chaque requête par le carottage :
// startSampling() juste avant l'appel, endSampling() dès la réponse (ou l'échec),
// pour que la fenêtre mesurée corresponde exactement à la requête.
function ChatPanel({ onMessageSent, startSampling, endSampling }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const [providers, setProviders] = useState([])
  const [provider, setProvider] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchProviders()
      .then((list) => {
        if (cancelled) return
        setProviders(list)
        const saved = window.localStorage.getItem(PROVIDER_STORAGE_KEY)
        const isUsable = (id) => list.some((item) => item.id === id && item.available)
        setProvider(isUsable(saved) ? saved : (list.find((item) => item.available)?.id ?? ''))
      })
      .catch(() => {
        if (!cancelled) setProviders([])
      })
    return () => { cancelled = true }
  }, [])

  function handleProviderChange(event) {
    setProvider(event.target.value)
    window.localStorage.setItem(PROVIDER_STORAGE_KEY, event.target.value)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const text = input.trim()
    if (!text || sending) return

    const history = messages.map(({ role, content }) => ({ role, content }))
    setMessages((prev) => [...prev, { role: 'user', content: text }])
    setInput('')
    setSending(true)
    setError(null)
    startSampling()

    try {
      const { reply, turnMetrics } = await sendChatMessage(text, { history, provider })
      setMessages((prev) => [...prev, { role: 'assistant', content: reply, turnMetrics }])
      onMessageSent?.()
    } catch (err) {
      setError(err.message)
    } finally {
      // Toujours refermer la fenêtre de carottage, même en échec : sinon la
      // bande ambrée resterait ouverte indéfiniment sur les courbes.
      endSampling()
      setSending(false)
    }
  }

  return (
    <section className="chat-panel" aria-label="Chat">
      <h2>Chat</h2>
      <div className="chat-messages">
        {messages.length === 0 && (
          <p className="chat-empty">
            Envoie un message : la fenêtre requête → réponse s'allume sur les courbes de
            l'onglet Infra et les métriques du tour apparaissent sous la réponse.
          </p>
        )}
        {messages.map((message, index) => (
          // eslint-disable-next-line react/no-array-index-key -- les messages sont append-only, l'index est stable
          <div key={index} className={`chat-bubble chat-bubble-${message.role}`}>
            <p>{message.content}</p>
            {message.turnMetrics && <TurnMetrics metrics={message.turnMetrics} />}
          </div>
        ))}
        {sending && <div className="chat-bubble chat-bubble-assistant chat-pending">…</div>}
      </div>

      {error && <p className="status status-error">{error}</p>}

      <form className="chat-input-row" onSubmit={handleSubmit}>
        <select
          className="chat-provider"
          aria-label="Cible LLM"
          value={provider}
          onChange={handleProviderChange}
        >
          {providers.length === 0 && <option value="">(cibles indisponibles)</option>}
          {providers.map((item) => (
            <option key={item.id} value={item.id} disabled={!item.available}>
              {item.label}
            </option>
          ))}
        </select>
        <input
          className="chat-input"
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask something..."
          disabled={sending}
        />
        <button type="submit" disabled={sending || !input.trim()}>Send</button>
      </form>
    </section>
  )
}

export default ChatPanel
