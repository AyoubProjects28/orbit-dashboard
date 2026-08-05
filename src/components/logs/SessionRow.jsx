import { useState } from 'react'
import TurnRow from './TurnRow'

function formatDate(ts) {
  return new Date(ts).toLocaleString([], {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

function formatCost(usd) {
  return usd < 0.01 ? `$${usd.toFixed(6)}` : `$${usd.toFixed(2)}`
}

function aggregate(turns) {
  let tokens = 0
  let cost = 0
  let cpuSeconds = 0
  const providers = new Set()
  for (const turn of turns) {
    tokens += turn.metrics?.total_tokens ?? 0
    cost += turn.metrics?.cost_usd ?? 0
    if (turn.provider) providers.add(turn.provider)
    if (turn.sampling) {
      for (const vm of Object.values(turn.sampling.vms)) {
        cpuSeconds += vm.cpu_seconds ?? 0
      }
    }
  }
  return { tokens, cost, cpuSeconds, providers: Array.from(providers) }
}

function SessionRow({ session }) {
  const [open, setOpen] = useState(false)
  const { turns } = session
  const { tokens, cost, cpuSeconds, providers } = aggregate(turns)
  const firstTs = turns[0]?.ts

  return (
    <div className="session-row">
      <button type="button" className="session-row-toggle" onClick={() => setOpen((value) => !value)}>
        <span className="session-row-caret">{open ? '⌄' : '›'}</span>
        <span className="session-row-name">{session.session_name}</span>
        <span className="session-row-meta">
          {firstTs && formatDate(firstTs)} · {providers.join(', ') || 'no target'} ·{' '}
          {turns.length} prompt{turns.length === 1 ? '' : 's'} · {tokens.toLocaleString()} tok ·{' '}
          {formatCost(cost)} · {cpuSeconds.toFixed(1)} CPU·s
        </span>
      </button>
      {open && (
        <div className="session-row-turns">
          {turns.map((turn) => <TurnRow key={turn.id} turn={turn} />)}
        </div>
      )}
    </div>
  )
}

export default SessionRow
