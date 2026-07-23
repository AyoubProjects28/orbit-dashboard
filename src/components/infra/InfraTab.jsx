import { cpuIncreasePct } from '../../lib/sampling'
import { VMS } from '../../hooks/useVmMetrics'
import VmCard, { VM_META } from './VmCard'

function SamplingLine({ vm, stats }) {
  const increase = cpuIncreasePct(stats.cpu_avg, stats.cpu_base)
  return (
    <li>
      <b>{VM_META[vm].name}</b> — CPU avg. {stats.cpu_avg.toFixed(0)}% (peak {stats.cpu_peak.toFixed(0)}%),{' '}
      {increase === null
        ? `baseline too low for a ratio (${stats.cpu_base.toFixed(1)}%)`
        : `i.e. ${increase >= 0 ? '+' : ''}${increase.toFixed(0)}% vs base ${stats.cpu_base.toFixed(1)}%`}
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
        <h3>Last sampling</h3>
        {lastSampling ? (
          <>
            <p className="sampling-window">Window measured: {lastSampling.window_s.toFixed(1)} s</p>
            <ul>
              {VMS.map((vm) => (
                <SamplingLine key={vm} vm={vm} stats={lastSampling.vms[vm]} />
              ))}
            </ul>
          </>
        ) : (
          <p className="panel-empty">
            Send a prompt: the request→response window lights up on the charts and real
            consumption is measured here.
          </p>
        )}
      </section>
    </div>
  )
}

export default InfraTab
