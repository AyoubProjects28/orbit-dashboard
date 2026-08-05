// Onglet « Logs » — sessions journalisées côté backend (JSONL append-only,
// voir nasa-back/sessionLog.js et spec §5.1/§7 étape 3).
import { useCallback, useEffect, useState } from 'react'
import { fetchLogs } from '../../api/logs'
import SessionRow from './SessionRow'

function LogsTab() {
  const [sessions, setSessions] = useState(null)
  const [error, setError] = useState(null)

  const refresh = useCallback(() => {
    fetchLogs()
      .then((data) => {
        setSessions(data.sessions ?? [])
        setError(null)
      })
      .catch((err) => setError(err.message))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <div className="logs-tab">
      <section className="panel logs-panel" aria-label="Session history">
        <div className="logs-header">
          <h2>Session history</h2>
          <button type="button" className="logs-refresh-btn" onClick={refresh}>Refresh</button>
        </div>

        {error && <p className="status status-error">Could not load logs: {error}</p>}

        {sessions === null && !error && <p className="panel-empty">Loading…</p>}

        {sessions?.length === 0 && (
          <p className="panel-empty">
            No prompts logged yet. Send a message from the chat — it'll show up here once the
            reply comes back.
          </p>
        )}

        {sessions?.length > 0 && (
          <div className="session-list">
            {sessions.map((session) => <SessionRow key={session.session_id} session={session} />)}
          </div>
        )}
      </section>
    </div>
  )
}

export default LogsTab
