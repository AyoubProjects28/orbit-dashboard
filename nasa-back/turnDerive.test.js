import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizePrompt, promptKey, derivePromptKey, deriveCondition, deriveUsedMcpTool } from './turnDerive.js'

test('normalizePrompt trims, collapses whitespace and lowercases', () => {
  assert.equal(normalizePrompt('  How  Many\tFiles?  '), 'how many files?')
})

test('normalizePrompt tolerates non-string input', () => {
  assert.equal(normalizePrompt(undefined), '')
  assert.equal(normalizePrompt(null), '')
})

test('promptKey is stable for equivalent prompts (whitespace/case only)', () => {
  assert.equal(promptKey('How many files?'), promptKey('  how   many files?  '))
})

test('promptKey differs for different prompts', () => {
  assert.notEqual(promptKey('How many files?'), promptKey('How many documents?'))
})

test('promptKey is prefixed sha1: like scores.jsonl question_id equivalents', () => {
  assert.match(promptKey('x'), /^sha1:[0-9a-f]{40}$/)
})

test('derivePromptKey uses the stored prompt_key when present', () => {
  assert.equal(derivePromptKey({ prompt_key: 'sha1:stored', prompt: 'ignored' }), 'sha1:stored')
})

test('derivePromptKey falls back to hashing the prompt text', () => {
  assert.equal(derivePromptKey({ prompt: 'How many files?' }), promptKey('How many files?'))
})

test('deriveCondition returns the stored condition, not inferred', () => {
  assert.deepEqual(deriveCondition({ condition: 'no-mcp' }), { condition: 'no-mcp', inferred: false })
})

test('deriveCondition falls back to authorized/inferred for turns with no condition', () => {
  assert.deepEqual(deriveCondition({}), { condition: 'authorized', inferred: true })
})

test('deriveUsedMcpTool is true when a calls entry has vm "mcp"', () => {
  assert.equal(deriveUsedMcpTool({ calls: [{ vm: 'llm' }, { vm: 'mcp' }] }), true)
})

test('deriveUsedMcpTool is false when calls exist but none are vm "mcp"', () => {
  assert.equal(deriveUsedMcpTool({ calls: [{ vm: 'llm' }] }), false)
})

test('deriveUsedMcpTool is null (unknown) when there is no calls array at all', () => {
  assert.equal(deriveUsedMcpTool({ calls: null }), null)
  assert.equal(deriveUsedMcpTool({}), null)
})
