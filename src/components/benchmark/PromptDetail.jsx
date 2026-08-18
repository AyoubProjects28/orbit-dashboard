import { Fragment, useState } from 'react'
import { CONDITIONS, CONDITION_LABELS, aggregate } from '../../lib/families'

const MATCH_MODES = [
  { id: 'contains', label: 'Auto · contains', hint: 'Case-insensitive substring match against the reply.' },
  { id: 'regex', label: 'Auto · regex', hint: 'Each expected item is its own regular expression.' },
  { id: 'manual', label: 'Manual', hint: 'A human ticks each run ✓/✗ below — no auto-grading.' },
]

function formatCost(usd) {
  return Number.isFinite(usd) ? `$${usd.toFixed(4)}` : '—'
}

function formatSeconds(ms) {
  return Number.isFinite(ms) ? `${(ms / 1000).toFixed(1)}s` : '—'
}

function formatPercent(ratio) {
  return ratio == null ? '—' : `${Math.round(ratio * 100)}%`
}

function mcpCalledLabel(condition, agg) {
  if (condition === 'no-mcp') return 'n/a'
  return agg.n ? `${agg.n - agg.skipped}/${agg.n}` : '—'
}

// "lower" (cost/latency/tokens): the smaller side wins, shown as a ÷ or ×
// multiplier, always >= 1. "higher" (accuracy): a plain point difference.
function delta(baseline, best, better, get) {
  if (!baseline || !best || !better) return null
  const b = get(baseline)
  const t = get(best)
  if (better === 'lower') {
    if (!(b > 0) || !(t > 0)) return null
    return b >= t
      ? { text: `÷${(b / t).toFixed(1)}`, win: true }
      : { text: `×${(t / b).toFixed(1)}`, win: false }
  }
  // better === 'higher'
  const diff = Math.round((t - b) * 100)
  return { text: `${diff >= 0 ? '+' : ''}${diff} pts`, win: diff >= 0 }
}

function runAccuracyMark(run) {
  if (!run.graded || !run.expectedCount) return null
  return run.matchedCount / run.expectedCount >= 0.9
}

// The ⇄ drill-down: one prompt, 3 conditions side by side, then every
// individual run. Only reachable for a prompt complete under all 3
// conditions (SPEC §7) — FamilyCard doesn't render the ⇄ action otherwise.
function PromptDetail({ family, group, prompt, promptKey, expectation, onBack, onSetExpectation, onGradeRun }) {
  const [editing, setEditing] = useState(false)
  const [itemsInput, setItemsInput] = useState('')
  const [matchMode, setMatchMode] = useState('contains')
  const [savingExpectation, setSavingExpectation] = useState(false)
  const [expectationError, setExpectationError] = useState(null)
  const [gradingTurnId, setGradingTurnId] = useState(null)
  const [gradeError, setGradeError] = useState(null)

  function startEdit() {
    setItemsInput((expectation?.expected_items ?? []).join(', '))
    setMatchMode(expectation?.match ?? 'contains')
    setExpectationError(null)
    setEditing(true)
  }

  async function handleSaveExpectation(event) {
    event.preventDefault()
    const items = itemsInput.split(',').map((s) => s.trim()).filter(Boolean)
    if (items.length === 0) {
      setExpectationError('At least one expected item is required.')
      return
    }
    setSavingExpectation(true)
    setExpectationError(null)
    try {
      await onSetExpectation(promptKey, { expectedItems: items, match: matchMode })
      setEditing(false)
    } catch (err) {
      setExpectationError(err.message)
    } finally {
      setSavingExpectation(false)
    }
  }

  async function handleManualGrade(run, correct) {
    const expectedCount = expectation?.expected_items?.length || 1
    setGradingTurnId(run.turnId)
    setGradeError(null)
    try {
      await onGradeRun(run.turnId, {
        expectedCount,
        matchedCount: correct ? expectedCount : 0,
        foundCount: correct ? expectedCount : 0,
      })
    } catch (err) {
      setGradeError(err.message)
    } finally {
      setGradingTurnId(null)
    }
  }

  if (!group) {
    return (
      <section className="panel" aria-label="Prompt detail">
        <p className="panel-empty">This prompt is no longer available.</p>
        <button type="button" className="btn" onClick={onBack}>← Back to family</button>
      </section>
    )
  }

  const perCondition = Object.fromEntries(
    CONDITIONS.map((c) => [c, group.byCondition[c].length ? aggregate(group.byCondition[c]) : null]),
  )
  const baseline = perCondition['no-mcp']
  const best = perCondition.forced ?? perCondition.authorized

  const providers = new Set(CONDITIONS.flatMap((c) => group.byCondition[c].map((r) => r.provider)).filter(Boolean))
  const providerLabel = providers.size === 1 ? [...providers][0] : providers.size > 1 ? 'mixed provider' : 'unknown provider'

  const rows = [
    { label: 'Runs', get: (a) => a.n, format: (v) => String(v), better: null },
    { label: 'Cost (median)', get: (a) => a.cost.median, format: formatCost, better: 'lower' },
    { label: 'Cost min / max', get: (a) => a, format: (a) => `${formatCost(a.cost.min)} / ${formatCost(a.cost.max)}`, better: null },
    { label: 'Accuracy', get: (a) => a.accuracy ?? 0, format: (v, a) => (a.accuracy == null ? 'not graded' : formatPercent(v)), better: 'higher' },
    { label: 'Noise', get: (a) => a.noise ?? 0, format: (v, a) => (a.noise == null ? 'not graded' : formatPercent(v)), better: null },
    { label: 'Latency (avg)', get: (a) => a.latency.avg, format: formatSeconds, better: 'lower' },
    { label: 'Tokens (avg)', get: (a) => a.tokens.avg, format: (v) => Math.round(v).toString(), better: 'lower' },
    { label: 'Graded', get: (a) => a, format: (a) => `${a.graded.n}/${a.graded.total}`, better: null },
  ]

  return (
    <section className="panel prompt-detail" aria-label="Prompt detail">
      <div className="detail-head">
        <button type="button" className="btn" onClick={onBack}>← Back to family</button>
        <span className="src-badge src-orbit">Orbit local · {providerLabel}</span>
      </div>

      <p className="detail-breadcrumb">{family?.name} / prompt</p>
      <div className="prompt-text">{prompt}</div>

      {editing ? (
        <form className="expectation-form" onSubmit={handleSaveExpectation}>
          <div className="field">
            <label htmlFor="expected-items">Expected item(s), comma-separated</label>
            <input
              id="expected-items"
              type="text"
              value={itemsInput}
              onChange={(event) => setItemsInput(event.target.value)}
              placeholder="12"
              autoFocus
            />
          </div>
          <div className="field">
            <label>Grading mode</label>
            <div className="seg">
              {MATCH_MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  title={mode.hint}
                  className={matchMode === mode.id ? 'on' : ''}
                  onClick={() => setMatchMode(mode.id)}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>
          {expectationError && <p className="status status-error">{expectationError}</p>}
          <div className="modal-actions">
            <button type="button" className="btn" onClick={() => setEditing(false)} disabled={savingExpectation}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={savingExpectation}>
              {savingExpectation ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      ) : (
        <p className="expected">
          Expected answer:{' '}
          {expectation ? (
            <>
              <strong>{expectation.expected_items?.join(', ')}</strong>
              <span className="badge badge-ok">{expectation.match}</span>
            </>
          ) : (
            <span className="dim">not set</span>
          )}
          <button type="button" className="icon-btn" style={{ marginLeft: 8 }} onClick={startEdit}>
            Edit
          </button>
        </p>
      )}

      <div className="cmp">
        <div className="cmp-h" />
        {CONDITIONS.map((c, i) => (
          <div key={c} className={`cmp-h cmp-col-${i + 1}`}>{CONDITION_LABELS[c]}</div>
        ))}
        <div className="cmp-h">Δ</div>

        {rows.map((row) => {
          const d = row.better ? delta(baseline, best, row.better, row.get) : null
          return (
            <Fragment key={row.label}>
              <div className="cmp-k">{row.label}</div>
              {CONDITIONS.map((c) => {
                const agg = perCondition[c]
                return (
                  <div key={c} className="cmp-d">
                    {agg ? row.format(row.get(agg), agg) : <span className="dim">—</span>}
                    {row.label === 'Runs' && agg && (
                      <span className="sub">MCP called {mcpCalledLabel(c, agg)}</span>
                    )}
                  </div>
                )
              })}
              <div className="cmp-d">
                {d ? <span className={d.win ? 'win' : 'lose'}>{d.text}</span> : <span className="dim">—</span>}
              </div>
            </Fragment>
          )
        })}
      </div>

      <div className="runs">
        <h3>Individual runs</h3>
        {expectation?.match === 'manual' && gradeError && <p className="status status-error">{gradeError}</p>}
        {CONDITIONS.map((c) => {
          const runsForCondition = group.byCondition[c]
          if (!runsForCondition.length) return null
          return (
            <div key={c} className="run-pill-row">
              <span className="lbl" style={{ color: 'var(--text-h)' }}>{CONDITION_LABELS[c]}</span>
              {runsForCondition.map((run, i) => {
                const mark = runAccuracyMark(run)
                return (
                  <span key={run.turnId} className={`run-pill${run.graded ? '' : ' ungraded'}`}>
                    run {i + 1} · {formatCost(run.cost)} · {formatSeconds(run.latencyMs)} · {run.totalTokens} tok ·{' '}
                    {run.graded
                      ? <span className={mark ? 'ok' : 'ko'}>{mark ? '✓' : '✗'}</span>
                      : <span className="warn">not graded</span>}
                    {c !== 'no-mcp' && (
                      run.usedMcp === true ? <span className="ok"> · MCP</span>
                        : run.usedMcp === false ? <span className="warn"> · MCP skipped</span>
                          : <span className="dim"> · MCP unknown</span>
                    )}
                    {expectation?.match === 'manual' && (
                      <span className="run-pill-grade">
                        <button
                          type="button"
                          className="icon-btn"
                          disabled={gradingTurnId === run.turnId}
                          onClick={() => handleManualGrade(run, true)}
                          title="Mark correct"
                        >
                          ✓
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          disabled={gradingTurnId === run.turnId}
                          onClick={() => handleManualGrade(run, false)}
                          title="Mark incorrect"
                        >
                          ✗
                        </button>
                      </span>
                    )}
                  </span>
                )
              })}
            </div>
          )
        })}
      </div>

      <p className="note">
        <strong>Where the numbers come from:</strong> cost, latency and tokens are read straight from
        the logged turns. <strong>Accuracy and noise are not</strong> — they are graded against the
        expected answer above. <strong>An ungraded run is excluded from accuracy and noise, never
        counted as wrong</strong> — but still counts for cost, latency and tokens. Hence the{' '}
        <code>Graded n/m</code> row.
      </p>
    </section>
  )
}

export default PromptDetail
