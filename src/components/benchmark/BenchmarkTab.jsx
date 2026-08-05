import { useEffect, useRef, useState } from 'react'
import Tabs from '../Tabs'
// Explicit extension: on a case-insensitive filesystem (Windows, macOS by
// default), an extensionless import of './BubbleChart' tries .js before
// .jsx and gets hijacked by bubbleChart.js (the pure geometry module,
// different case) instead of the component — wrong module loaded, no
// default export, blank screen. The explicit extension forces exact
// resolution.
import BubbleChart from './BubbleChart.jsx'
import {
  CONDITIONS,
  conditionColor,
  conditionLabel,
  loadScores,
  parseScoresJsonl,
  saveScores,
  clearScores,
} from '../../lib/benchmark'

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

  const subTabs = [
    {
      id: 'accuracy',
      label: 'Accuracy',
      content: (
        <BubbleChart
          runs={runs}
          metric="accuracy"
          yLabel="Accuracy → tables actually found"
          emptyLabel={emptyLabel}
        />
      ),
    },
    {
      id: 'noise',
      label: 'Noise',
      content: (
        <BubbleChart
          runs={runs}
          metric="noise"
          invert
          yLabel="Noise → invented tables"
          emptyLabel={emptyLabel}
        />
      ),
    },
  ]

  return (
    <div className="benchmark-tab">
      <section className="panel benchmark-panel" aria-label="MCP benchmark">
        <div className="benchmark-header">
          <h2>MCP Benchmark</h2>
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
        </div>

        {error && <p className="status status-error">{error}</p>}

        {skipped > 0 && (
          <p className="status benchmark-warning">
            {skipped} line{skipped > 1 ? 's' : ''} skipped (unreadable JSON) — the remaining runs
            are shown.
          </p>
        )}

        <Tabs tabs={subTabs} active={subTab} onChange={setSubTab} />

        {runs.length > 0 && (
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
