// Onglet « Logs » — placeholder. L'implémentation arrive à l'étape 3, avec
// la persistance JSONL côté backend (voir spec §5.1 et §7, étape 3).
function LogsTab() {
  return (
    <div className="logs-tab">
      <section className="panel" aria-label="Session history">
        <h2>Historique des sessions</h2>
        <p className="panel-empty">
          L'historique de tous les prompts et de leurs métriques, conservé d'une session à
          l'autre, arrive à l'étape 3 : il demande la persistance JSONL côté backend.
        </p>
      </section>
    </div>
  )
}

export default LogsTab
