import { useEffect, useState } from 'react'

function formatTime(ts) {
  return new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 1 })
}

function formatLatency(ts0, ts1) {
  return `latency ${(ts1 - ts0).toFixed(1)} s`
}

// Un payload {truncated:true, preview} vient de la troncature live à 10 Ko
// côté backend (callEvents.js) : on affiche `preview` en texte brut, jamais
// le résultat d'un JSON.stringify sur l'enveloppe (produirait une ligne
// échappée illisible) — voir v2 §4.2.
function PayloadToggle({ detail }) {
  const [open, setOpen] = useState(false)
  if (!detail) return null
  return (
    <div className="call-detail-payload">
      <button type="button" className="call-detail-payload-toggle" onClick={() => setOpen((value) => !value)}>
        {open ? 'Hide payload' : 'View payload'}
      </button>
      {open && (
        detail.truncated
          ? <pre className="call-detail-payload-body">{detail.preview}{'\n'}(truncated at 10 KB)</pre>
          : <pre className="call-detail-payload-body">{JSON.stringify(detail, null, 2)}</pre>
      )}
    </div>
  )
}

function CallDetail({ call, onClose }) {
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="call-detail" role="dialog" aria-label={`Call ${call.seq}`}>
      <div className="call-detail-head">
        <span>Call {call.seq} · {call.vm.toUpperCase()}</span>
        <button type="button" className="call-detail-close" aria-label="Close" onClick={onClose}>×</button>
      </div>

      <div className="call-detail-section">
        <div className="call-detail-section-head">
          <span className="call-detail-section-label">SENT</span>
          <span className="call-detail-section-time">{formatTime(call.ts0)}</span>
        </div>
        <p className="call-detail-summary">{call.sent.summary}</p>
        <PayloadToggle detail={call.sent.detail} />
      </div>

      <div className="call-detail-section">
        <div className="call-detail-section-head">
          <span className="call-detail-section-label">RESPONSE</span>
          {call.ts1 != null && <span className="call-detail-section-time">{formatTime(call.ts1)}</span>}
        </div>
        {call.status === 'pending' && <p className="call-detail-summary">pending…</p>}
        {call.status !== 'pending' && (
          <>
            <p className="call-detail-summary">{call.received.summary}</p>
            {call.status === 'done' && <PayloadToggle detail={call.received.detail} />}
          </>
        )}
      </div>

      {call.ts1 != null && <div className="call-detail-latency">{formatLatency(call.ts0, call.ts1)}</div>}
    </div>
  )
}

export default CallDetail
