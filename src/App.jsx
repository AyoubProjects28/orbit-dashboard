import { useCallback, useEffect, useState } from 'react'
import { fetchMetrics } from './api/metrics'
import SummaryBar from './components/SummaryBar'
// Hardware metrics are mocked (no real measurement yet) — panel disabled
// until we have a way to measure actual hardware consumption. Do not
// delete HardwarePanel.jsx; re-enable this import when real data lands.
// import HardwarePanel from './components/HardwarePanel'
import LatencyPanel from './components/LatencyPanel'
import TokensPanel from './components/TokensPanel'
import CostPanel from './components/CostPanel'
import ChatPanel from './components/ChatPanel'
import './App.css'

const POLL_INTERVAL_MS = 12000

function App() {
  const [metrics, setMetrics] = useState(null)
  const [error, setError] = useState(null)

  const refreshMetrics = useCallback(() => {
    fetchMetrics()
      .then((data) => {
        setMetrics(data)
        setError(null)
      })
      .catch((err) => setError(err.message))
  }, [])

  // Fetch once on mount, then keep hardware drifting passively on an
  // interval. ChatPanel calls refreshMetrics() again after each message —
  // that's the event-driven path for latency/tokens/cost.
  useEffect(() => {
    refreshMetrics()
    const interval = setInterval(refreshMetrics, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [refreshMetrics])

  return (
    <div className="app">
      <header className="app-header">
        <h1>Orbit Dashboard</h1>
        <p className="subtitle">LLM usage at a glance</p>
      </header>

      {error && <p className="status status-error">Could not load metrics: {error}</p>}
      {!error && !metrics && <p className="status">Loading metrics…</p>}

      {metrics && (
        <div className="layout">
          <ChatPanel onMessageSent={refreshMetrics} />
          <div className="dashboard">
            <SummaryBar data={metrics} />
            <div className="panels">
              {/* <HardwarePanel data={metrics} /> — disabled, hardware metrics are mocked */}
              <LatencyPanel data={metrics} />
              <TokensPanel data={metrics} />
              <CostPanel data={metrics} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
