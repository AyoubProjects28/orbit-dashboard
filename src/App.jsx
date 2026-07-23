import { useCallback, useEffect, useState } from 'react'
import { fetchMetrics } from './api/metrics'
import { useVmMetrics } from './hooks/useVmMetrics'
import Tabs from './components/Tabs'
import ChatPanel from './components/ChatPanel'
import InfraTab from './components/infra/InfraTab'
import UsageTab from './components/usage/UsageTab'
import LogsTab from './components/logs/LogsTab'
import './App.css'

const POLL_INTERVAL_MS = 12000

function App() {
  const [metrics, setMetrics] = useState(null)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('infra')

  // Monté ICI, au-dessus des onglets : le tampon de métriques doit survivre
  // aux changements d'onglet, sinon un prompt envoyé depuis Usage ou Logs
  // produirait un carottage sans baseline. Voir hooks/useVmMetrics.js.
  const vm = useVmMetrics()

  const refreshMetrics = useCallback(() => {
    fetchMetrics()
      .then((data) => {
        setMetrics(data)
        setError(null)
      })
      .catch((err) => setError(err.message))
  }, [])

  useEffect(() => {
    refreshMetrics()
    const interval = setInterval(refreshMetrics, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [refreshMetrics])

  const tabs = [
    {
      id: 'infra',
      label: 'Infra',
      content: (
        <InfraTab
          latest={vm.latest}
          online={vm.online}
          lastSampling={vm.lastSampling}
          buffersRef={vm.buffersRef}
          samplingRef={vm.samplingRef}
        />
      ),
    },
    {
      id: 'usage',
      label: 'Usage',
      content: metrics ? <UsageTab data={metrics} /> : <p className="status">Loading metrics…</p>,
    },
    { id: 'logs', label: 'Logs', content: <LogsTab /> },
  ]

  return (
    <div className="app">
      <header className="app-header">
        <h1>Orbit Dashboard</h1>
        <p className="subtitle">LLM usage at a glance</p>
      </header>

      {error && <p className="status status-error">Could not load metrics: {error}</p>}

      <div className="layout">
        <ChatPanel
          onMessageSent={refreshMetrics}
          startSampling={vm.startSampling}
          endSampling={vm.endSampling}
        />
        <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      </div>
    </div>
  )
}

export default App
