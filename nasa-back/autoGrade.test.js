import { test } from 'node:test'
import assert from 'node:assert/strict'
import { autoGrade } from './autoGrade.js'

test('contains mode matches case-insensitively', () => {
  const grade = autoGrade('There are 12 files in the folder.', { expected_items: ['12'], match: 'contains' })
  assert.equal(grade.matched_count, 1)
  assert.equal(grade.expected_count, 1)
})

test('contains mode counts each expected item independently', () => {
  const grade = autoGrade('12 documents, 3 folders.', { expected_items: ['12', '3', '99'], match: 'contains' })
  assert.equal(grade.matched_count, 2)
  assert.equal(grade.expected_count, 3)
})

test('found_count always equals matched_count — auto grading cannot detect hallucinated extras', () => {
  const grade = autoGrade('12 files', { expected_items: ['12'], match: 'contains' })
  assert.equal(grade.found_count, grade.matched_count)
})

test('regex mode treats each expected item as its own pattern', () => {
  const grade = autoGrade('Total size: 1.4 MB', { expected_items: ['\\d+(\\.\\d+)?\\s*MB'], match: 'regex' })
  assert.equal(grade.matched_count, 1)
})

test('an invalid regex is skipped, not thrown', () => {
  const grade = autoGrade('anything', { expected_items: ['('], match: 'regex' })
  assert.equal(grade.matched_count, 0)
})

test('returns null for manual mode — no auto engine for it', () => {
  assert.equal(autoGrade('12 files', { expected_items: ['12'], match: 'manual' }), null)
})

test('returns null when there is no expectation at all', () => {
  assert.equal(autoGrade('12 files', null), null)
  assert.equal(autoGrade('12 files', undefined), null)
})

test('returns null for an expectation with an empty expected_items list', () => {
  assert.equal(autoGrade('12 files', { expected_items: [], match: 'contains' }), null)
})

test('records mode and graded_by on the returned grade', () => {
  const grade = autoGrade('12 files', { expected_items: ['12'], match: 'contains' })
  assert.equal(grade.mode, 'auto')
  assert.equal(grade.graded_by, 'auto:contains')
})

test('never throws on a non-string reply', () => {
  assert.doesNotThrow(() => autoGrade(undefined, { expected_items: ['12'], match: 'contains' }))
  assert.doesNotThrow(() => autoGrade(null, { expected_items: ['12'], match: 'contains' }))
})
