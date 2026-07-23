import { cpuIncreasePct } from '../../lib/sampling'
import { VMS } from '../../hooks/useVmMetrics'
import VmCard, { VM_META } from './VmCard'

function SamplingLine({ vm, stats }) {
  const increase = cpuIncreasePct(stats.cpu_avg, stats.cpu_base)
  return (
    <li>
      <b>{VM_META[vm].name}</b> — CPU moy. {stats.cpu_avg.toFixed(0)}% (pic {stats.cpu_peak.toFixed(0)}%),{' '}
      {increase === null
        ? `baseline trop basse pour un ratio (${stats.cpu_base.toFixed(1)}%)`
        : `soit ${increase >= 0 ? '+' : ''}${increase.toFixed(0)}% vs base ${stats.cpu_base.toFixed(1)}%`}
      {' · '}RAM {stats.mem_avg.toFixed(0)}% · <b>{stats.cpu_seconds.toFixed(1)} CPU·s</b>
    </li>
  )
}

function InfraTab({ latest, online, lastSampling, buffersRef, samplingRef }) {
  return (
    <div className="infra-tab">
      <div className="vm-grid">
        {VMS.map((vm) => (
          <VmCard
            key={vm}
            vm={vm}
            sample={latest[vm]}
            online={online[vm]}
            buffersRef={buffersRef}
            samplingRef={samplingRef}
          />
        ))}
      </div>

      <section className="sampling-summary" data-testid="sampling-summary">
        <h3>Dernier carottage</h3>
        {lastSampling ? (
          <>
            <p className="sampling-window">Fenêtre mesurée : {lastSampling.window_s.toFixed(1)} s</p>
            <ul>
              {VMS.map((vm) => (
                <SamplingLine key={vm} vm={vm} stats={lastSampling.vms[vm]} />
              ))}
            </ul>
          </>
        ) : (
          <p className="panel-empty">
            Envoie un prompt : la fenêtre requête → réponse s'allume sur les courbes et la
            consommation réelle est mesurée ici.
          </p>
        )}
      </section>
    </div>
  )
}

export default InfraTab
