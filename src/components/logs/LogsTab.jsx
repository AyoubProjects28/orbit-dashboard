// Onglet « Logs » — placeholder. L'implémentation arrive à l'étape 3, avec
// la persistance JSONL côté backend (voir spec §5.1 et §7, étape 3).
function LogsTab() {
  return (
    <div className="logs-tab">
      <section className="panel" aria-label="Session history">
        <h2>Session history</h2>
        <p className="panel-empty">
          The history of every prompt and its metrics, kept across sessions, is coming in
          step 3 — it requires JSONL persistence on the backend.
        </p>
      </section>
    </div>
  )
}

export default LogsTab
