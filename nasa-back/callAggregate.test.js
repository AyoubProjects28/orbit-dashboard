import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aggregateCalls } from './callAggregate.js'

test('un event sent seul produit un appel pending', () => {
  const [call] = aggregateCalls([
    { callId: 'c1', vm: 'llm', direction: 'sent', ts: 10, summary: '→ x' },
  ])
  assert.equal(call.status, 'pending')
  assert.equal(call.seq, 1)
  assert.equal(call.vm, 'llm')
  assert.equal(call.summary_sent, '→ x')
  assert.equal(call.summary_received, null)
  assert.equal(call.ts1, null)
  assert.equal(call.latency_ms, null)
})

test('sent + received produit un appel done avec la latence', () => {
  const [call] = aggregateCalls([
    { callId: 'c1', vm: 'mcp', direction: 'sent', ts: 10, summary: '→ x' },
    { callId: 'c1', vm: 'mcp', direction: 'received', ts: 10.5, summary: '← y' },
  ])
  assert.equal(call.status, 'done')
  assert.equal(call.summary_received, '← y')
  assert.equal(call.latency_ms, 500)
})

test('sent + error produit un appel error', () => {
  const [call] = aggregateCalls([
    { callId: 'c1', vm: 'llm', direction: 'sent', ts: 10, summary: '→ x' },
    { callId: 'c1', vm: 'llm', direction: 'error', ts: 11, summary: '✗ boom' },
  ])
  assert.equal(call.status, 'error')
  assert.equal(call.summary_received, '✗ boom')
  assert.equal(call.latency_ms, 1000)
})

test('numérote les appels dans l\'ordre de première apparition, relatif au tour', () => {
  const calls = aggregateCalls([
    { callId: 'c1', vm: 'llm', direction: 'sent', ts: 10, summary: 'a' },
    { callId: 'c1', vm: 'llm', direction: 'received', ts: 11, summary: 'a2' },
    { callId: 'c2', vm: 'mcp', direction: 'sent', ts: 12, summary: 'b' },
    { callId: 'c2', vm: 'mcp', direction: 'received', ts: 12.1, summary: 'b2' },
  ])
  assert.deepEqual(calls.map((c) => c.seq), [1, 2])
})

test('tolère des events désordonnés pour le même appel', () => {
  const [call] = aggregateCalls([
    { callId: 'c1', vm: 'llm', direction: 'received', ts: 11, summary: 'a2' },
    { callId: 'c1', vm: 'llm', direction: 'sent', ts: 10, summary: 'a' },
  ])
  assert.equal(call.status, 'done')
  assert.equal(call.summary_sent, 'a')
  assert.equal(call.summary_received, 'a2')
  assert.equal(call.latency_ms, 1000)
})
