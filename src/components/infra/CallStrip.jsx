import { useEffect, useRef, useState } from 'react'
import CallDetail from './CallDetail'

function CallSquare({ call, selected, highlighted, onSelect, onHighlight }) {
  return (
    <button
      type="button"
      className={`call-square call-square-${call.status}${selected ? ' call-square-selected' : ''}${highlighted ? ' call-square-highlighted' : ''}`}
      data-testid={`call-square-${call.vm}`}
      onClick={() => onSelect(call.callId)}
      onMouseEnter={() => onHighlight?.(call.callId)}
      onMouseLeave={() => onHighlight?.(null)}
    >
      {call.seq}
    </button>
  )
}

// Une colonne = un appel, ordonnées par ts0 croissant, chaque carré dans la
// rangée de sa VM (v2 §3.1). Pas de regroupement temporel : dans
// l'architecture actuelle un appel LLM et un appel MCP ne sont jamais
// concurrents (le backend attend la réponse du LLM avant de lancer l'outil).
// `selectedCallId` est un état local : rien en dehors de la bande et de son
// overlay n'en a besoin (voir "Design decisions" du plan).
function CallStrip({ callsByVm, highlightedCallId, onHighlightCall }) {
  const [selectedCallId, setSelectedCallId] = useState(null)
  const wrapRef = useRef(null)
  const scrollRef = useRef(null)

  const allCalls = [...(callsByVm?.llm ?? []), ...(callsByVm?.mcp ?? [])].sort((a, b) => a.ts0 - b.ts0)
  const selectedCall = allCalls.find((call) => call.callId === selectedCallId) ?? null

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [allCalls.length])

  useEffect(() => {
    if (!selectedCallId) return undefined
    function onPointerDown(event) {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setSelectedCallId(null)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [selectedCallId])

  function toggleSelect(callId) {
    setSelectedCallId((current) => (current === callId ? null : callId))
  }

  return (
    <div className="call-strip-wrap" ref={wrapRef}>
      <div className="call-strip" ref={scrollRef}>
        {allCalls.map((call) => (
          <div key={call.callId} className="call-strip-column">
            <div className="call-strip-cell">
              {call.vm === 'llm' && (
                <CallSquare
                  call={call}
                  selected={call.callId === selectedCallId}
                  highlighted={call.callId === highlightedCallId}
                  onSelect={toggleSelect}
                  onHighlight={onHighlightCall}
                />
              )}
            </div>
            <div className="call-strip-cell">
              {call.vm === 'mcp' && (
                <CallSquare
                  call={call}
                  selected={call.callId === selectedCallId}
                  highlighted={call.callId === highlightedCallId}
                  onSelect={toggleSelect}
                  onHighlight={onHighlightCall}
                />
              )}
            </div>
          </div>
        ))}
      </div>
      {selectedCall && <CallDetail call={selectedCall} onClose={() => setSelectedCallId(null)} />}
    </div>
  )
}

export default CallStrip
