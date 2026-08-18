import { useCallback, useEffect, useMemo, useState } from 'react'
import { assignToFamily, deleteFamily, fetchFamilies, gradeTurn, saveFamily, setExpectation } from '../../api/families'
import { CONDITIONS, CONDITION_LABELS, buildRuns, groupRuns, unassignedTurns } from '../../lib/families'
import FamilyCard from './FamilyCard'
import NewFamilyModal from './NewFamilyModal'
import PromptDetail from './PromptDetail.jsx'
import UnassignedInbox from './UnassignedInbox'

// Third Benchmark sub-tab: Orbit's own turns.jsonl + families.jsonl, grouped
// by hand into families (SPEC_families.md). Owns the toolbar, the inbox, the
// family list, and which view is showing — the family list or one prompt's
// ⇄ drill-down (PromptDetail). No top-level chart here: the family cards
// already show every family at a glance, and a Group-by selector on top of
// that was redundant — see the Accuracy/Noise sub-tabs for where grouping
// actually earns its place.
function FamiliesTab() {
  const [payload, setPayload] = useState(null)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [visibleConditions, setVisibleConditions] = useState(() => new Set(CONDITIONS))
  const [openFamilyIds, setOpenFamilyIds] = useState(() => new Set())
  const [modalOpen, setModalOpen] = useState(false)
  const [detail, setDetail] = useState(null) // { familyId, promptKey } | null

  const refresh = useCallback(() => {
    fetchFamilies()
      .then((data) => {
        setPayload(data)
        setError(null)
      })
      .catch((err) => setError(err.message))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const runs = useMemo(() => (payload ? buildRuns(payload) : []), [payload])
  const unassigned = useMemo(() => (payload ? unassignedTurns(payload) : []), [payload])
  const families = useMemo(() => (payload?.families ?? []).filter((f) => !f.deleted), [payload])
  const visibleFamilies = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? families.filter((f) => f.name.toLowerCase().includes(q)) : families
  }, [families, search])

  // Scoped to the one family the ⇄ was clicked from: two turns can share a
  // prompt_key but sit in different families if someone assigns them
  // inconsistently, and the drill-down should only ever show the family the
  // reader came from.
  const detailView = useMemo(() => {
    if (!detail) return null
    const detailRuns = runs.filter((r) => r.familyId === detail.familyId && r.promptKey === detail.promptKey)
    const group = groupRuns('prompt', detailRuns)[0] ?? null
    const family = families.find((f) => f.id === detail.familyId) ?? null
    const expectation = (payload?.expectations ?? []).find((e) => e.prompt_key === detail.promptKey) ?? null
    const prompt = detailRuns[0]?.prompt ?? detail.promptKey
    return { group, family, expectation, prompt }
  }, [detail, runs, families, payload])

  function toggleCondition(condition) {
    setVisibleConditions((prev) => {
      if (prev.has(condition)) {
        if (prev.size === 1) return prev // at least one must remain visible
        const next = new Set(prev)
        next.delete(condition)
        return next
      }
      const next = new Set(prev)
      next.add(condition)
      return next
    })
  }

  function toggleFamilyOpen(id) {
    setOpenFamilyIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleCreateFamily({ name, description }) {
    await saveFamily({ name, description })
    refresh()
  }

  async function handleDeleteFamily(id) {
    try {
      await deleteFamily(id)
      refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleAssign(familyId, turnIds) {
    await assignToFamily(familyId, turnIds)
    refresh()
  }

  async function handleSetExpectation(promptKey, { expectedItems, match }) {
    await setExpectation(promptKey, { expectedItems, match })
    refresh()
  }

  async function handleGradeRun(turnId, counts) {
    await gradeTurn(turnId, counts)
    refresh()
  }

  const loading = payload === null && !error

  return (
    <div className="families-tab">
      {error && <p className="status status-error">Could not load families: {error}</p>}
      {loading && <p className="panel-empty">Loading…</p>}
      {payload?.skipped > 0 && (
        <p className="status benchmark-warning">
          {payload.skipped} line{payload.skipped > 1 ? 's' : ''} skipped in families.jsonl (unreadable
          JSON) — the rest of the tab still renders normally.
        </p>
      )}

      {payload && detailView && (
        <PromptDetail
          family={detailView.family}
          group={detailView.group}
          prompt={detailView.prompt}
          promptKey={detail.promptKey}
          expectation={detailView.expectation}
          onBack={() => setDetail(null)}
          onSetExpectation={handleSetExpectation}
          onGradeRun={handleGradeRun}
        />
      )}

      {payload && !detailView && (
        <>
          <div className="toolbar families-toolbar">
            <input
              type="search"
              className="search families-search"
              placeholder="Search a family by name…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <span className="lbl">Show</span>
            <div className="chips">
              {CONDITIONS.map((condition) => (
                <button
                  key={condition}
                  type="button"
                  className={`chip${visibleConditions.has(condition) ? ' on' : ''}`}
                  onClick={() => toggleCondition(condition)}
                >
                  {CONDITION_LABELS[condition]}
                </button>
              ))}
            </div>
            <button type="button" className="btn btn-primary" onClick={() => setModalOpen(true)}>
              + New family
            </button>
            <button type="button" className="btn" onClick={refresh}>Refresh</button>
          </div>

          <div className="cols families-cols">
            <UnassignedInbox turns={unassigned} families={families} onAssign={handleAssign} />

            <div className="families-list">
              {visibleFamilies.length === 0 && (
                <p className="panel-empty">
                  {families.length === 0
                    ? 'No families yet — create one to start grouping prompts.'
                    : `No family matches "${search}".`}
                </p>
              )}
              {visibleFamilies.map((family) => (
                <FamilyCard
                  key={family.id}
                  family={family}
                  runs={runs.filter((r) => r.familyId === family.id)}
                  visibleConditions={visibleConditions}
                  open={openFamilyIds.has(family.id)}
                  onToggle={() => toggleFamilyOpen(family.id)}
                  onDelete={() => handleDeleteFamily(family.id)}
                  onOpenPrompt={(promptKey) => setDetail({ familyId: family.id, promptKey })}
                />
              ))}
            </div>
          </div>
        </>
      )}

      <NewFamilyModal open={modalOpen} onClose={() => setModalOpen(false)} onCreate={handleCreateFamily} />
    </div>
  )
}

export default FamiliesTab
