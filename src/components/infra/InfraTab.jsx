import { VMS } from '../../hooks/useVmMetrics'
import VmCard from './VmCard'

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
            calls={callsByVm?.[vm]}
            highlightedCallId={highlightedCallId}
            onHighlightCall={onHighlightCall}
          />
        ))}
      </div>
    </div>
  )
}

export default InfraTab
