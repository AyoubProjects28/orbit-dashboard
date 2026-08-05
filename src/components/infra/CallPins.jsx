import { PADDING, timeRatio } from './orbitChart'
import { WINDOW_S } from '../../hooks/useVmMetrics'

function pinLeft(ratio) {
  return `calc(${PADDING.left}px + (100% - ${PADDING.left + PADDING.right}px) * ${ratio})`
}

// Un appel produit une ou deux pastilles : l'envoi (toujours) et la réponse
// (dès qu'elle est arrivée), toutes deux numérotées avec `call.seq` — c'est
// ce qui rend la latence lisible à l'œil (v2 §2). Plus de tooltip : le
// survol ne sert plus qu'au surlignage croisé avec la bande de carrés (§5).
function pinsForCall(call) {
  const pins = [{ key: `${call.callId}-sent`, callId: call.callId, seq: call.seq, ts: call.ts0, direction: 'sent' }]
  if (call.status !== 'pending') {
    pins.push({
      key: `${call.callId}-${call.status}`,
      callId: call.callId,
      seq: call.seq,
      ts: call.ts1,
      direction: call.status === 'error' ? 'error' : 'received',
    })
  }
  return pins
}

function CallPins({ calls = [], highlightedCallId, onHighlightCall }) {
  const now = Date.now() / 1000
  const cutoff = now - WINDOW_S
  const visible = calls.filter((call) => call.ts0 >= cutoff)
  const pins = visible.flatMap(pinsForCall)

  return (
    <div className="call-pin-lane">
      {pins.map((pin) => {
        const ratio = timeRatio({ t: pin.ts, now, windowS: WINDOW_S })
        const highlighted = pin.callId === highlightedCallId
        return (
          <div
            key={pin.key}
            className={`call-pin call-pin-${pin.direction}${highlighted ? ' call-pin-highlighted' : ''}`}
            style={{ left: pinLeft(ratio) }}
            data-testid={`call-pin-${pin.direction}`}
            onMouseEnter={() => onHighlightCall?.(pin.callId)}
            onMouseLeave={() => onHighlightCall?.(null)}
          >
            {pin.seq}
          </div>
        )
      })}
    </div>
  )
}

export default CallPins
