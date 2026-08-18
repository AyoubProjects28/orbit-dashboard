// Persistance JSONL des familles de benchmark — append-only, jamais de
// réécriture. Mirroir exact de sessionLog.js (voir SPEC_families.md §4) :
// un fichier, lignes discriminées par `type`, état reconstruit en rejouant
// le fichier dans l'ordre, dernière ligne gagne.
//
// Module isolé, pure I/O + replay : aucune connaissance de turns.jsonl.
// `validTurnIds` est injecté par l'appelant (index.js, via sessionLog.readLogs())
// plutôt que lu ici, pour que ce module reste testable sans fixtures de
// turns.jsonl et n'empiète pas sur sessionLog.js.
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOG_DIR = path.join(__dirname, 'logs')
const LOG_FILE = path.join(LOG_DIR, 'families.jsonl')

function appendLine(entry) {
  fs.mkdirSync(LOG_DIR, { recursive: true })
  fs.appendFileSync(LOG_FILE, `${JSON.stringify(entry)}\n`)
}

// { id, name, description, deleted } — deleted defaults to false; a delete
// is a re-emit with deleted: true, a restore is a re-emit with deleted: false.
export function appendFamily({ id, name, description, deleted = false }) {
  appendLine({ type: 'family', id, name, description, ts: new Date().toISOString(), deleted })
}

// family_id: null removes the turn from every family (unassign).
export function appendAssignment(turnId, familyId) {
  appendLine({ type: 'assignment', turn_id: turnId, family_id: familyId, ts: new Date().toISOString() })
}

// grade: { expected_count, matched_count, found_count, mode, graded_by }
export function appendGrade(turnId, grade) {
  appendLine({ type: 'grade', turn_id: turnId, ...grade, ts: new Date().toISOString() })
}

// expectation: { expected_items, match }
export function appendExpectation(promptKey, expectation) {
  appendLine({ type: 'expectation', prompt_key: promptKey, ...expectation, ts: new Date().toISOString() })
}

// Rejoue families.jsonl top to bottom. `validTurnIds` (Set<string> | undefined):
// when provided, an assignment whose turn_id isn't in it is dropped (a log
// could be rotated) — see SPEC §4 replay rules. Omitted entirely in isolated
// tests of this module, which don't have a turns.jsonl to check against.
export function readFamiliesState(validTurnIds) {
  const lines = fs.existsSync(LOG_FILE)
    ? fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean)
    : []

  let skipped = 0
  const familiesById = new Map()
  const assignmentsByTurn = new Map()
  const gradesByTurn = new Map()
  const expectationsByPrompt = new Map()

  for (const line of lines) {
    let entry
    try {
      entry = JSON.parse(line)
    } catch {
      skipped += 1
      continue
    }
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      skipped += 1
      continue
    }

    if (entry.type === 'family') {
      if (!entry.id) { skipped += 1; continue }
      familiesById.set(entry.id, entry)
    } else if (entry.type === 'assignment') {
      if (!entry.turn_id) { skipped += 1; continue }
      assignmentsByTurn.set(entry.turn_id, entry.family_id ?? null)
    } else if (entry.type === 'grade') {
      if (!entry.turn_id) { skipped += 1; continue }
      gradesByTurn.set(entry.turn_id, entry)
    } else if (entry.type === 'expectation') {
      if (!entry.prompt_key) { skipped += 1; continue }
      expectationsByPrompt.set(entry.prompt_key, entry)
    }
    // Unknown type: skipped, never fatal — and NOT counted as malformed,
    // unlike a JSON parse failure (SPEC §4 draws that distinction).
  }

  // A deleted family's assignments are ignored, not deleted (re-emitting the
  // family with deleted: false restores them on the next replay — nothing
  // to do here, the raw assignment line is still in the file either way).
  const assignments = []
  for (const [turnId, familyId] of assignmentsByTurn) {
    if (validTurnIds && !validTurnIds.has(turnId)) continue
    if (familyId == null) continue
    const family = familiesById.get(familyId)
    if (!family || family.deleted) continue
    assignments.push({ turn_id: turnId, family_id: familyId })
  }

  return {
    families: [...familiesById.values()],
    assignments,
    grades: [...gradesByTurn.values()],
    expectations: [...expectationsByPrompt.values()],
    skipped,
  }
}
