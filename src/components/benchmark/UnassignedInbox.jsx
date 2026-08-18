import { useState } from 'react'
import { CONDITION_LABELS } from '../../lib/families'

// Multi-select + "Add to family…" (decision 9 — no drag & drop). Never
// aggregated: decision 7, "Unassigned" is an inbox, not a family.
function UnassignedInbox({ turns, families, onAssign }) {
  const [selected, setSelected] = useState(() => new Set())
  const [targetFamilyId, setTargetFamilyId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  function toggle(turnId) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(turnId)) next.delete(turnId)
      else next.add(turnId)
      return next
    })
  }

  function clearSelection() {
    setSelected(new Set())
  }

  async function handleAssign() {
    if (!targetFamilyId || selected.size === 0) return
    setBusy(true)
    setError(null)
    try {
      await onAssign(targetFamilyId, [...selected])
      clearSelection()
      setTargetFamilyId('')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel unassigned-inbox" aria-label="Unassigned turns">
      <h3>Unassigned <span className="inbox-count">({turns.length})</span></h3>
      <p className="inbox-hint">
        Turns from the chat, not yet in a family. <strong>No stats here</strong> — averaging
        unrelated prompts means nothing.
      </p>

      {error && <p className="status status-error">{error}</p>}

      {turns.length === 0 ? (
        <p className="inbox-empty">Nothing waiting — every logged turn is already in a family.</p>
      ) : (
        <div className="inbox-list">
          {turns.map((turn) => (
            <label key={turn.id} className={`inbox-item${selected.has(turn.id) ? ' sel' : ''}`}>
              <input
                type="checkbox"
                checked={selected.has(turn.id)}
                onChange={() => toggle(turn.id)}
              />
              <span>
                {turn.prompt}
                <span className="inbox-meta">
                  {turn.ts} · {turn.session_id} · {CONDITION_LABELS[turn.condition] ?? turn.condition}
                </span>
              </span>
            </label>
          ))}
        </div>
      )}

      <div className="inbox-actions">
        <select
          className="inbox-family-select"
          aria-label="Target family"
          value={targetFamilyId}
          onChange={(event) => setTargetFamilyId(event.target.value)}
          disabled={selected.size === 0 || families.length === 0}
        >
          <option value="">
            {families.length === 0 ? '(create a family first)' : 'Choose a family…'}
          </option>
          {families.map((family) => (
            <option key={family.id} value={family.id}>{family.name}</option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!targetFamilyId || selected.size === 0 || busy}
          onClick={handleAssign}
        >
          {busy ? 'Adding…' : `Add ${selected.size || ''} to family`.trim()}
        </button>
        <button type="button" className="btn" disabled={selected.size === 0} onClick={clearSelection}>
          Clear
        </button>
      </div>
    </div>
  )
}

export default UnassignedInbox
