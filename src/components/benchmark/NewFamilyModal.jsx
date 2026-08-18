import { useState } from 'react'

// name + mandatory description (SPEC_families.md §5/§7) — rejected client
// AND server side; this is the client half, nasa-back/index.js's
// POST /api/families is the server half.
function NewFamilyModal({ open, onClose, onCreate }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  if (!open) return null

  function handleClose() {
    setName('')
    setDescription('')
    setError(null)
    onClose()
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const trimmedName = name.trim()
    const trimmedDescription = description.trim()
    if (!trimmedName) {
      setError('A family needs a name.')
      return
    }
    if (!trimmedDescription) {
      setError('Description is mandatory — it is the sentence you read out loud to the client.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await onCreate({ name: trimmedName, description: trimmedDescription })
      handleClose()
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <div className="overlay on" role="presentation" onClick={handleClose}>
      <form
        className="modal"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h2>New family</h2>
        <div className="field">
          <label htmlFor="family-name">Name</label>
          <input
            id="family-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Recipe monolith → microservices"
            autoFocus
          />
        </div>
        <div className="field">
          <label htmlFor="family-description">Description *</label>
          <textarea
            id="family-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Why these prompts belong together — this is what you read out loud to the client."
          />
          <p className="hint">Mandatory. A family without a stated objective is just a folder.</p>
        </div>
        {error && <p className="status status-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={handleClose} disabled={submitting}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default NewFamilyModal
