import { useState } from 'react'
import { PADDING, timeRatio } from './orbitChart'
import { WINDOW_S } from '../../hooks/useVmMetrics'

function pinLeft(ratio) {
  return `calc(${PADDING.left}px + (100% - ${PADDING.left + PADDING.right}px) * ${ratio})`
}

function CallPins({ events = [] }) {
  const [hoveredId, setHoveredId] = useState(null)
  const [expandedId, setExpandedId] = useState(null)

  const now = Date.now() / 1000
  const cutoff = now - WINDOW_S
  const visible = events.filter((event) => event.ts >= cutoff)

  return (
    <div className="call-pin-lane">
      {visible.map((event) => {
        const ratio = timeRatio({ t: event.ts, now, windowS: WINDOW_S })
        const isOpen = hoveredId === event.id
        return (
          <div
            key={event.id}
            className={`call-pin call-pin-${event.direction}`}
            style={{ left: pinLeft(ratio) }}
            data-testid={`call-pin-${event.direction}`}
            onMouseEnter={() => setHoveredId(event.id)}
            onMouseLeave={() => setHoveredId((id) => (id === event.id ? null : id))}
          >
            {isOpen && (
              <div className="call-pin-tooltip">
                <div className="call-pin-tooltip-kind">{event.kind === 'llm' ? 'LLM call' : 'MCP call'}</div>
                <div className="call-pin-tooltip-summary">{event.summary}</div>
                <button
                  type="button"
                  className="call-pin-tooltip-toggle"
                  onClick={() => setExpandedId((id) => (id === event.id ? null : event.id))}
                >
                  {expandedId === event.id ? 'Hide payload' : 'View payload'}
                </button>
                {expandedId === event.id && (
                  <pre className="call-pin-tooltip-detail">{JSON.stringify(event.detail, null, 2)}</pre>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default CallPins
