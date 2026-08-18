import { useMemo } from 'react'
import {
  CONDITIONS,
  CONDITION_LABELS,
  aggregate,
  aggregateFamily,
  groupRuns,
  promptCompleteness,
} from '../../lib/families'

function formatCost(usd) {
  if (!Number.isFinite(usd)) return '—'
  return usd < 0.01 ? `$${usd.toFixed(6)}` : `$${usd.toFixed(2)}`
}

function formatPercent(ratio) {
  return ratio == null ? null : `${Math.round(ratio * 100)}%`
}

// "no-MCP costs 3.7x more" — whichever side is bigger reads as the
// numerator, so the number shown is always >= 1.
function costRatio(baseline, best) {
  if (!baseline || !best || !(baseline.cost > 0) || !(best.cost > 0)) return null
  return baseline.cost >= best.cost
    ? { symbol: '÷', value: baseline.cost / best.cost }
    : { symbol: '×', value: best.cost / baseline.cost }
}

function firstRun(promptGroup) {
  for (const condition of CONDITIONS) {
    if (promptGroup.byCondition[condition].length) return promptGroup.byCondition[condition][0]
  }
  return null
}

// One collapsible family: header KPIs + per-prompt table (SPEC_families.md §7).
function FamilyCard({ family, runs, visibleConditions, open, onToggle, onDelete, onOpenPrompt }) {
  const promptGroups = useMemo(() => groupRuns('prompt', runs), [runs])
  const familyResult = useMemo(() => aggregateFamily(promptGroups), [promptGroups])
  const totalAgg = useMemo(() => aggregate(runs), [runs])
  const inferredCount = runs.filter((r) => r.conditionInferred).length
  const conditions = CONDITIONS.filter((c) => visibleConditions.has(c))

  const ratio = familyResult.comparable
    ? costRatio(familyResult.byCondition['no-mcp'], familyResult.byCondition.forced ?? familyResult.byCondition.authorized)
    : null

  function handleDelete(event) {
    event.stopPropagation()
    if (window.confirm(`Delete "${family.name}"? Its prompts return to Unassigned; nothing is lost.`)) {
      onDelete()
    }
  }

  return (
    <div className={`family-card${open ? ' open' : ''}`}>
      <div
        className="family-card-head"
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onToggle()
          }
        }}
      >
        <span className="family-caret" aria-hidden="true">▶</span>
        <div className="family-title">
          <div className="family-name">
            {family.name}
            {inferredCount > 0 && (
              <span
                className="badge badge-warn"
                title="These runs predate this feature — condition is assumed ('authorized'), not measured."
              >
                {inferredCount} inferred
              </span>
            )}
          </div>
          <div className="family-desc">{family.description}</div>
        </div>
        <div className="family-kpi">
          {ratio
            ? <><b className={ratio.symbol === '÷' ? 'win' : 'lose'}>{ratio.symbol}{ratio.value.toFixed(1)}</b><small>cost, no-MCP → best</small></>
            : <><b className="dim">—</b><small>not comparable</small></>}
        </div>
        <div className="family-kpi">
          <b>{promptGroups.length} prompt{promptGroups.length === 1 ? '' : 's'}</b>
          <small>{totalAgg.n} run{totalAgg.n === 1 ? '' : 's'} · {familyResult.completePrompts}/{familyResult.totalPrompts} comparable</small>
        </div>
        <button type="button" className="icon-btn family-delete" onClick={handleDelete} title="Delete family">✕</button>
      </div>

      {open && (
        <div className="family-body">
          <table className="family-table">
            <thead>
              <tr>
                <th className="l">Prompt</th>
                {conditions.map((c) => <th key={c}>{CONDITION_LABELS[c]}</th>)}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {promptGroups.map((group) => {
                const completeness = promptCompleteness(group)
                const prompt = firstRun(group)?.prompt ?? group.key
                return (
                  <tr key={group.key} className={completeness.complete ? '' : 'partial'}>
                    <td className="l">
                      {prompt}
                      <span className="sub">
                        {completeness.complete ? (
                          `${completeness.total}/${completeness.total} conditions`
                        ) : (
                          <span className="badge badge-warn">
                            {completeness.n}/{completeness.total} conditions — excluded from the family rollup
                          </span>
                        )}
                      </span>
                    </td>
                    {conditions.map((c) => {
                      const cellRuns = group.byCondition[c]
                      if (!cellRuns.length) return <td key={c} className="dim">—</td>
                      const cellAgg = aggregate(cellRuns)
                      const accuracyLabel = formatPercent(cellAgg.accuracy)
                      return (
                        <td key={c}>
                          {formatCost(cellAgg.cost.median)}
                          <span className="sub">
                            n={cellAgg.n}
                            {accuracyLabel ? ` · ${accuracyLabel} acc` : ' · not graded'}
                            {cellAgg.graded.n < cellAgg.n && <span className="warn"> · graded {cellAgg.graded.n}/{cellAgg.n}</span>}
                            {cellAgg.skipped > 0 && <span className="warn"> · {cellAgg.skipped} skip</span>}
                          </span>
                        </td>
                      )
                    })}
                    <td>
                      {completeness.complete ? (
                        <button
                          type="button"
                          className="icon-btn"
                          title="Compare the 3 conditions"
                          onClick={() => onOpenPrompt(group.key)}
                        >
                          ⇄
                        </button>
                      ) : (
                        <span
                          className="dim"
                          title={`Replay this prompt under the ${completeness.total - completeness.n} missing condition(s) from Chat, then it'll complete on its own.`}
                        >
                          Complete
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
              <tr className="total">
                <td className="l">
                  Family median
                  <span className="sub">{familyResult.completePrompts} comparable prompt(s) only</span>
                </td>
                {conditions.map((c) => {
                  const x = familyResult.byCondition?.[c]
                  if (!x) return <td key={c} className="dim">—</td>
                  const accuracyLabel = formatPercent(x.accuracy)
                  return (
                    <td key={c}>
                      {formatCost(x.cost)}
                      <span className="sub">
                        {accuracyLabel ? `${accuracyLabel} acc` : 'not graded'}
                        {x.graded.n < x.graded.total && <span className="warn"> · graded {x.graded.n}/{x.graded.total}</span>}
                        {x.mixedProvider && <span className="warn"> · mixed provider — not comparable</span>}
                      </span>
                    </td>
                  )
                })}
                <td></td>
              </tr>
            </tbody>
          </table>
          {!familyResult.comparable && (
            <p className="family-note">
              <strong>Not comparable yet</strong> — 0/{familyResult.totalPrompts} prompt(s) exist under
              all 3 conditions. The <code>forced</code> condition isn&apos;t implemented yet, so this is
              expected today, not a bug.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default FamilyCard
