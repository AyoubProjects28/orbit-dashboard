import { useEffect, useRef, useState } from 'react'
import Tabs from '../Tabs'
// Explicit extension: on a case-insensitive filesystem (Windows, macOS by
// default), an extensionless import of './BubbleChart' tries .js before
// .jsx and gets hijacked by bubbleChart.js (the pure geometry module,
// different case) instead of the component — wrong module loaded, no
// default export, blank screen. The explicit extension forces exact
// resolution.
import BubbleChart from './BubbleChart.jsx'
import FamiliesTab from './FamiliesTab.jsx'
import {
  CONDITIONS,
  conditionColor,
  conditionLabel,
  loadScores,
  parseScoresJsonl,
  saveScores,
  clearScores,
} from '../../lib/benchmark'

// Decision 8 (SPEC_families.md §3): a visible source badge on every
// sub-tab, so the two cost scales this tab holds — $0.27–3.14/run external
// vs $0.000005/token local — are never mistaken for one axis.
const SOURCE_BADGES = {
  accuracy: { className: 'src-ext', label: 'External agent · CAST Imaging · $0.27–3.14/run' },
  noise: { className: 'src-ext', label: 'External agent · CAST Imaging · $0.27–3.14/run' },
  families: { className: 'src-orbit', label: "Orbit local · turns.jsonl · $0.000005/token" },
}

// scores.jsonl has no family concept (that's Orbit's own data) — only
// session_id and question_id are available to group by, alongside the
// existing ungrouped per-run view.
const GROUP_BY_LEVELS = [
  { id: 'run', label: 'Run' },
  { id: 'session', label: 'Session' },
  { id: 'question', label: 'Question' },
]

// "Benchmark" tab — agent-alone vs agent + MCP CAST Imaging comparison.
//
// Unlike Infra / Usage / Logs, this tab reads NOTHING from the backend: its
// data comes from a scores.jsonl produced outside the Orbit stack (a
// Claude/Cursor-class agent against the Recipe app, 72k LoC). The orders of
// magnitude have nothing to do with Orbit's own — $0.27 to $3.14 per
// question here, versus $0.000005 per token for Qwen 2.5:7B running
// locally. Don't merge the two cost scales.
//
// The file is dropped by hand in the UI rather than served by a backend
// route: in a client demo we want to show THEIR app's benchmark without
// redeploying. The last dropped file replaces the previous one and survives
// an F5 (see saveScores) — an accidental reload mid-demo shouldn't force
// re-dropping the file.
function BenchmarkTab() {
  const [runs, setRuns] = useState([])
  const [fileName, setFileName] = useState(null)
  const [skipped, setSkipped] = useState(0)
  const [error, setError] = useState(null)
  const [subTab, setSubTab] = useState('accuracy')
  const [groupBy, setGroupBy] = useState('run')
  const inputRef = useRef(null)

  // Restore the last dropped file. Re-parses the raw text rather than
  // reloading serialized runs: if normalizeRun changes shape, a cache
  // written by an earlier version stays usable.
  useEffect(() => {
    const stored = loadScores()
    if (!stored) return
    const parsed = parseScoresJsonl(stored.text)
    setRuns(parsed.runs)
    setSkipped(parsed.skipped)
    setFileName(stored.fileName)
  }, [])

  async function handleFile(event) {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const parsed = parseScoresJsonl(text)
      if (parsed.runs.length === 0) {
        setError('No usable runs in this file — expected one JSON object per line.')
        return
      }
      setRuns(parsed.runs)
      setSkipped(parsed.skipped)
      setFileName(file.name)
      setError(null)
      saveScores(text, file.name)
    } catch (err) {
      setError(`Could not read file: ${err.message}`)
    } finally {
      // Without this, re-dropping the SAME file after a fix doesn't fire a
      // change event and the user thinks the tab is stuck.
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function handleClear() {
    setRuns([])
    setFileName(null)
    setSkipped(0)
    setError(null)
    clearScores()
  }

  const emptyLabel = 'Drop a scores.jsonl file to see the runs.'

  // Only meaningful once there's something to group — matches the legend's
  // own runs.length > 0 gate below. Rendered per sub-tab (not once above the
  // Tabs bar) so it only ever shows next to a chart that uses it — Families
  // never sees it (SPEC: grouping there was redundant with the family cards).
  //
  // Hidden for now (className="hidden", display: none) rather than not
  // rendered at all: kept in the DOM on purpose so it's a one-class flip to
  // bring back, not a rebuild, once this is ready to ship.
  const groupByToolbar = runs.length > 0 && (
    <div className="toolbar hidden">
      <span className="lbl">Group by</span>
      <div className="seg">
        {GROUP_BY_LEVELS.map((level) => (
          <button
            key={level.id}
            type="button"
            className={groupBy === level.id ? 'on' : ''}
            onClick={() => setGroupBy(level.id)}
          >
            {level.label}
          </button>
        ))}
      </div>
    </div>
  )

  const subTabs = [
    {
      id: 'accuracy',
      label: 'Accuracy',
      content: (
        <>
          {groupByToolbar}
          <BubbleChart
            runs={runs}
            metric="accuracy"
            yLabel="Accuracy → tables actually found"
            emptyLabel={emptyLabel}
            groupBy={groupBy}
          />
        </>
      ),
    },
    {
      id: 'noise',
      label: 'Noise',
      content: (
        <>
          {groupByToolbar}
          <BubbleChart
            runs={runs}
            metric="noise"
            invert
            yLabel="Noise → invented tables"
            emptyLabel={emptyLabel}
            groupBy={groupBy}
          />
        </>
      ),
    },
    {
      id: 'families',
      label: 'Families',
      content: <FamiliesTab />,
    },
  ]

  // Families reads nothing this component owns (no upload, no scores.jsonl
  // parse state) — its own error/loading/empty states live inside
  // FamiliesTab. The upload chrome and the scores.jsonl-specific legend
  // below belong only to Accuracy/Noise (decision 8: never mix the two
  // sources in the same figure or the same controls).
  const isFamilies = subTab === 'families'
  const badge = SOURCE_BADGES[subTab]

  return (
    <div className="benchmark-tab">
      <section className="panel benchmark-panel" aria-label="MCP benchmark">
        <div className="benchmark-header">
          <h2>MCP Benchmark</h2>
          {!isFamilies && (
            <div className="benchmark-actions">
              {fileName && <span className="benchmark-file">{fileName} · {runs.length} runs</span>}
              <label className="benchmark-upload-btn">
                {runs.length > 0 ? 'Replace file' : 'Load a scores.jsonl'}
                <input
                  ref={inputRef}
                  type="file"
                  accept=".jsonl,.json,.txt"
                  onChange={handleFile}
                  aria-label="Load a scores.jsonl"
                />
              </label>
              {runs.length > 0 && (
                <button type="button" className="benchmark-clear-btn" onClick={handleClear}>
                  Clear
                </button>
              )}
            </div>
          )}
        </div>

        {!isFamilies && error && <p className="status status-error">{error}</p>}

        {!isFamilies && skipped > 0 && (
          <p className="status benchmark-warning">
            {skipped} line{skipped > 1 ? 's' : ''} skipped (unreadable JSON) — the remaining runs
            are shown.
          </p>
        )}

        <Tabs
          tabs={subTabs}
          active={subTab}
          onChange={setSubTab}
          trailing={badge && <span className={`src-badge ${badge.className}`}>{badge.label}</span>}
        />

        {!isFamilies && runs.length > 0 && (
          <>
            <div className="benchmark-legend">
              {CONDITIONS.map((condition) => (
                <span key={condition}>
                  <i style={{ background: conditionColor(condition) }} />
                  {conditionLabel(condition)}
                </span>
              ))}
              <span>
                <i className="benchmark-legend-hollow" />
                hollow = MCP available, not called
              </span>
              <span>bubble size = cost of the run</span>
              <span>
                <i className="benchmark-legend-band" />
                light band = ideal zone
              </span>
            </div>
            <p className="benchmark-footnote">
              All results shown have been manually verified against the codebase.
            </p>
          </>
        )}
      </section>
    </div>
  )
}

export default BenchmarkTab
