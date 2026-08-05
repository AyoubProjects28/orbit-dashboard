import { VMS } from '../../hooks/useVmMetrics'
import VmCard from './VmCard'

function InfraTab({ latest, online, buffersRef, samplingRef, eventsByVm }) {
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
            events={eventsByVm?.[vm]}
          />
        ))}
      </div>
    </div>
  )
}

export default InfraTab
