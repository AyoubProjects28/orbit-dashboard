import { useState } from 'react'

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function truncate(text, max) {
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function seconds(ms) {
  return `${((ms ?? 0) / 1000).toFixed(1)} s`
}

// Delta CPU moyen de la VM LLM vs sa baseline, mesuré par le carottage
// (voir lib/sampling.js). `null` tant que le carottage n'est pas arrivé —
// possible si l'onglet a été fermé entre la réponse et la fin de la mesure.
function cpuDelta(sampling) {
  const llm = sampling?.vms?.llm
  if (!llm || llm.cpu_avg == null || llm.cpu_base == null) return null
  const delta = llm.cpu_avg - llm.cpu_base
  return `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} pts`
}

function formatCallLatency(ms) {
  return ms == null ? '—' : `${(ms / 1000).toFixed(2)} s`
}

function TurnRow({ turn }) {
  const [open, setOpen] = useState(false)
  const delta = cpuDelta(turn.sampling)
  const metrics = turn.metrics ?? {}

  return (
    <div className="turn-row">
      <button type="button" className="turn-row-summary" onClick={() => setOpen((value) => !value)}>
        <span className="turn-row-caret">{open ? '⌄' : '›'}</span>
        <span className="turn-row-time">{formatTime(turn.ts)}</span>
        <span className="turn-row-prompt">{truncate(turn.prompt, 80)}</span>
      </button>
      <div className="turn-row-stats">
        <span>{metrics.prompt_tokens ?? 0}/{metrics.completion_tokens ?? 0} tok</span>
        <span>{seconds(metrics.latency_ms)}</span>
        <span>{turn.route}</span>
        {turn.tools_called?.length > 0 && <span>{turn.tools_called.join(', ')}</span>}
        {delta && <span className="turn-row-cpu-delta">CPU {delta}</span>}
      </div>
      {open && (
        <div className="turn-row-detail">
          <div>
            <span className="turn-row-detail-label">Prompt</span>
            <p>{turn.prompt}</p>
          </div>
          <div>
            <span className="turn-row-detail-label">Reply</span>
            <p>{turn.reply}</p>
          </div>
          {turn.calls?.length > 0 && (
            <details className="turn-row-calls">
              <summary className="turn-row-calls-summary">Calls</summary>
              <div className="turn-row-calls-list">
                {turn.calls.map((call) => (
                  <div key={call.seq} className="turn-row-call">
                    <span className="turn-row-call-seq">{call.seq}</span>
                    <span className="turn-row-call-vm">{call.vm.toUpperCase()}</span>
                    <div className="turn-row-call-summaries">
                      <span>{call.summary_sent}</span>
                      <span>{call.summary_received ?? '…'}</span>
                    </div>
                    <span className="turn-row-call-latency">{formatCallLatency(call.latency_ms)}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  )
}

export default TurnRow
