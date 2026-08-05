import { useCallback, useEffect, useState } from 'react'
import { fetchMetrics } from './api/metrics'
import { useVmMetrics } from './hooks/useVmMetrics'
import { useCallEvents } from './hooks/useCallEvents'
import { useSession } from './hooks/useSession'
import Tabs from './components/Tabs'
import ChatPanel from './components/ChatPanel'
import InfraTab from './components/infra/InfraTab'
import CallStrip from './components/infra/CallStrip'
import UsageTab from './components/usage/UsageTab'
import LogsTab from './components/logs/LogsTab'
import BenchmarkTab from './components/benchmark/BenchmarkTab'
import './App.css'

const POLL_INTERVAL_MS = 12000

// Horloge distincte du nom de session : celui-ci doit rester figé à la
// création (voir hooks/useSession.js — il sert d'étiquette de regroupement
// dans Logs et doit correspondre à ce qui y est écrit), donc l'heure "live"
// est un affichage séparé plutôt qu'un remplacement de sessionName.
function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

function App() {
  const [metrics, setMetrics] = useState(null)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('infra')
  const [highlightedCallId, setHighlightedCallId] = useState(null)

  // Monté ICI, au-dessus des onglets : le tampon de métriques doit survivre
  // aux changements d'onglet, sinon un prompt envoyé depuis Usage ou Logs
  // produirait un carottage sans baseline. Voir hooks/useVmMetrics.js.
  const vm = useVmMetrics()
  const callEvents = useCallEvents()
  const session = useSession()
  const clock = useClock()

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

  const trailing = activeTab === 'infra' ? (
    <CallStrip
      callsByVm={callEvents.callsByVm}
      highlightedCallId={highlightedCallId}
      onHighlightCall={setHighlightedCallId}
    />
  ) : null

  const tabs = [
    {
      id: 'infra',
      label: 'Infra',
      content: (
        <InfraTab
          latest={vm.latest}
          online={vm.online}
          buffersRef={vm.buffersRef}
          samplingRef={vm.samplingRef}
          callsByVm={callEvents.callsByVm}
          highlightedCallId={highlightedCallId}
          onHighlightCall={setHighlightedCallId}
        />
      ),
    },
    {
      id: 'usage',
      label: 'Usage',
      content: metrics ? <UsageTab data={metrics} /> : <p className="status">Loading metrics…</p>,
    },
    { id: 'logs', label: 'Logs', content: <LogsTab /> },
    // Benchmark consumes neither metrics nor vm: its data is a scores.jsonl
    // dropped by hand, outside the Orbit stack. It's mounted with no props,
    // to the right of Logs.
    { id: 'benchmark', label: 'Benchmark', content: <BenchmarkTab /> },
  ]

  return (
    <div className="app">
      <header className="app-header">
        <h1>Orbit Dashboard</h1>
        <p className="subtitle">LLM usage at a glance</p>
        <div className="session-indicator">
          <span className="live-clock">{clock.toLocaleString()}</span>
          {session.sessionName && <span className="session-name">{session.sessionName}</span>}
          <button type="button" className="session-new-btn" onClick={session.startNewSession}>
            New session
          </button>
        </div>
      </header>

      {error && <p className="status status-error">Could not load metrics: {error}</p>}

      <div className="layout">
        <ChatPanel
          onMessageSent={refreshMetrics}
          startSampling={vm.startSampling}
          endSampling={vm.endSampling}
          sessionId={session.sessionId}
          lockSessionName={session.lockSessionName}
        />
        <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} trailing={trailing} />
      </div>
    </div>
  )
}

export default App
