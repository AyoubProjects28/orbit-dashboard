import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  appendFamily,
  appendAssignment,
  appendGrade,
  appendExpectation,
  readFamiliesState,
} from './familyLog.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOG_FILE = path.join(__dirname, 'logs', 'families.jsonl')
const BACKUP_FILE = `${LOG_FILE}.bak`

beforeEach(() => {
  if (fs.existsSync(LOG_FILE)) fs.renameSync(LOG_FILE, BACKUP_FILE)
})

afterEach(() => {
  if (fs.existsSync(LOG_FILE)) fs.rmSync(LOG_FILE)
  if (fs.existsSync(BACKUP_FILE)) fs.renameSync(BACKUP_FILE, LOG_FILE)
})

function appendRaw(line) {
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true })
  fs.appendFileSync(LOG_FILE, `${line}\n`)
}

test('appendFamily écrit une ligne family et readFamiliesState la retrouve', () => {
  appendFamily({ id: 'fam_a', name: 'Docs', description: 'Document questions' })
  const state = readFamiliesState()
  assert.equal(state.families.length, 1)
  assert.equal(state.families[0].id, 'fam_a')
  assert.equal(state.families[0].name, 'Docs')
  assert.equal(state.families[0].deleted, false)
})

test('re-émettre le même id de famille : la dernière ligne gagne', () => {
  appendFamily({ id: 'fam_a', name: 'Docs', description: 'v1' })
  appendFamily({ id: 'fam_a', name: 'Docs v2', description: 'v2' })
  const state = readFamiliesState()
  assert.equal(state.families.length, 1)
  assert.equal(state.families[0].name, 'Docs v2')
  assert.equal(state.families[0].description, 'v2')
})

test('une famille supprimée (deleted: true) cache ses assignations sans les supprimer', () => {
  appendFamily({ id: 'fam_a', name: 'Docs', description: 'd' })
  appendAssignment('t1', 'fam_a')
  let state = readFamiliesState()
  assert.equal(state.assignments.length, 1)

  appendFamily({ id: 'fam_a', name: 'Docs', description: 'd', deleted: true })
  state = readFamiliesState()
  assert.equal(state.assignments.length, 0)
  // La famille elle-même reste visible dans l'état complet, marquée deleted.
  assert.equal(state.families.find((f) => f.id === 'fam_a').deleted, true)

  // Restaurer la famille (ré-émettre deleted: false) restaure ses membres —
  // sans jamais modifier la ligne d'assignation d'origine.
  appendFamily({ id: 'fam_a', name: 'Docs', description: 'd', deleted: false })
  state = readFamiliesState()
  assert.equal(state.assignments.length, 1)
  assert.equal(state.assignments[0].turn_id, 't1')
})

test('assignation : la dernière ligne gagne (réassignation)', () => {
  appendFamily({ id: 'fam_a', name: 'A', description: 'a' })
  appendFamily({ id: 'fam_b', name: 'B', description: 'b' })
  appendAssignment('t1', 'fam_a')
  appendAssignment('t1', 'fam_b')
  const state = readFamiliesState()
  assert.equal(state.assignments.length, 1)
  assert.equal(state.assignments[0].family_id, 'fam_b')
})

test('family_id: null retire le tour de toute famille', () => {
  appendFamily({ id: 'fam_a', name: 'A', description: 'a' })
  appendAssignment('t1', 'fam_a')
  appendAssignment('t1', null)
  const state = readFamiliesState()
  assert.equal(state.assignments.length, 0)
})

test('une ligne JSON malformée est ignorée et comptée', () => {
  appendFamily({ id: 'fam_a', name: 'A', description: 'a' })
  appendRaw('{not valid json')
  appendRaw('null')
  appendRaw('[1,2,3]')
  const state = readFamiliesState()
  assert.equal(state.families.length, 1)
  assert.equal(state.skipped, 3)
})

test('un type de ligne inconnu est ignoré, jamais fatal, et non compté comme malformé', () => {
  appendFamily({ id: 'fam_a', name: 'A', description: 'a' })
  appendRaw(JSON.stringify({ type: 'something-future', foo: 'bar' }))
  const state = readFamiliesState()
  assert.equal(state.families.length, 1)
  assert.equal(state.skipped, 0)
})

test('une assignation dont le turn_id est absent de validTurnIds est ignorée silencieusement', () => {
  appendFamily({ id: 'fam_a', name: 'A', description: 'a' })
  appendAssignment('t1', 'fam_a')
  appendAssignment('t2', 'fam_a')
  const state = readFamiliesState(new Set(['t1']))
  assert.equal(state.assignments.length, 1)
  assert.equal(state.assignments[0].turn_id, 't1')
})

test('sans validTurnIds, toutes les assignations valides sont conservées', () => {
  appendFamily({ id: 'fam_a', name: 'A', description: 'a' })
  appendAssignment('t1', 'fam_a')
  appendAssignment('t2', 'fam_a')
  const state = readFamiliesState()
  assert.equal(state.assignments.length, 2)
})

test('appendGrade : la dernière note gagne par turn_id', () => {
  appendGrade('t1', { expected_count: 1, matched_count: 0, found_count: 1, mode: 'auto', graded_by: 'auto:contains' })
  appendGrade('t1', { expected_count: 1, matched_count: 1, found_count: 1, mode: 'auto', graded_by: 'auto:contains' })
  const state = readFamiliesState()
  assert.equal(state.grades.length, 1)
  assert.equal(state.grades[0].matched_count, 1)
})

test('appendExpectation : la dernière attente gagne par prompt_key', () => {
  appendExpectation('sha1:abc', { expected_items: ['12'], match: 'contains' })
  appendExpectation('sha1:abc', { expected_items: ['13'], match: 'contains' })
  const state = readFamiliesState()
  assert.equal(state.expectations.length, 1)
  assert.deepEqual(state.expectations[0].expected_items, ['13'])
})

test('un fichier absent retourne un état vide sans erreur', () => {
  const state = readFamiliesState()
  assert.deepEqual(state, { families: [], assignments: [], grades: [], expectations: [], skipped: 0 })
})
