import { VMS, VM_OF_SERVICE } from '../../hooks/useVmMetrics'
import VmCard from './VmCard'

// Regroupe les appels par VM physique via VM_OF_SERVICE, plutôt que par accès
// direct à callsByVm[vm] : un service (ex. mcp) peut vivre sur une autre VM
// (ex. web) que son nom le laisserait croire.
function callsForVm(callsByVm, vm) {
  return Object.entries(VM_OF_SERVICE)
    .filter(([, hostVm]) => hostVm === vm)
    .flatMap(([service]) => callsByVm?.[service] ?? [])
}

function InfraTab({ latest, online, buffersRef, samplingRef, callsByVm, highlightedCallId, onHighlightCall }) {
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
            calls={callsForVm(callsByVm, vm)}
            highlightedCallId={highlightedCallId}
            onHighlightCall={onHighlightCall}
          />
        ))}
      </div>
    </div>
  )
}

export default InfraTab
