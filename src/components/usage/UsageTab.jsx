import SummaryBar from './SummaryBar'
// Les métriques matérielles sont mockées (aucune mesure réelle) — panneau
// désactivé jusqu'à ce qu'on sache mesurer la consommation réelle. Ne pas
// supprimer HardwarePanel.jsx : réactiver cet import quand les vraies données
// arriveront. L'onglet Infra couvre déjà le CPU/RAM des VM, lui pour de vrai.
// import HardwarePanel from './HardwarePanel'
import LatencyPanel from './LatencyPanel'
import TokensPanel from './TokensPanel'
import CostPanel from './CostPanel'

// Onglet « Usage » — les métriques côté LLM (tokens, latence, coût), par
// opposition à l'onglet « Infra » qui montre les ressources des VM.
// À l'étape 2, ces panneaux liront la session courante plutôt que l'état
// global du backend.
function UsageTab({ data }) {
  return (
    <div className="usage-tab">
      <SummaryBar data={data} />
      <div className="panels">
        {/* <HardwarePanel data={data} /> — désactivé, données mockées */}
        <LatencyPanel data={data} />
        <TokensPanel data={data} />
        <CostPanel data={data} />
      </div>
    </div>
  )
}

export default UsageTab
