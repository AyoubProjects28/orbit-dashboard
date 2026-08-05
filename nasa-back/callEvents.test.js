import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emitCall, onCall, offCall, truncateDetail, traceCall } from './callEvents.js'

test('onCall reçoit les events émis par emitCall', () => {
  const received = []
  const listener = (event) => received.push(event)
  onCall(listener)
  emitCall({ vm: 'mcp', kind: 'mcp', direction: 'sent', ts: 1, summary: 'x', detail: { a: 1 } })
  offCall(listener)
  assert.equal(received.length, 1)
  assert.equal(received[0].vm, 'mcp')
  assert.equal(received[0].detail.a, 1)
  assert.ok(received[0].id)
})

test('offCall arrête la réception', () => {
  const received = []
  const listener = (event) => received.push(event)
  onCall(listener)
  offCall(listener)
  emitCall({ vm: 'llm', kind: 'llm', direction: 'sent', ts: 1, summary: 'x', detail: {} })
  assert.equal(received.length, 0)
})

test('truncateDetail laisse passer les petits payloads', () => {
  const detail = { a: 1 }
  assert.deepEqual(truncateDetail(detail), detail)
})

test('truncateDetail tronque les gros payloads', () => {
  const big = { text: 'x'.repeat(20000) }
  const result = truncateDetail(big)
  assert.equal(result.truncated, true)
  assert.ok(result.preview.length <= 10000)
})

test('traceCall émet sent puis received quand run() réussit', async () => {
  const events = []
  const listener = (e) => events.push(e)
  onCall(listener)
  const result = await traceCall({
    vm: 'mcp', kind: 'mcp', sentSummary: 'sent', sentDetail: {},
    describeResult: (r) => ({ summary: `got ${r}`, detail: { r } }),
  }, async () => 'ok')
  offCall(listener)
  assert.equal(result, 'ok')
  assert.equal(events.length, 2)
  assert.equal(events[0].direction, 'sent')
  assert.equal(events[1].direction, 'received')
  assert.equal(events[1].summary, 'got ok')
})

test('traceCall émet sent puis error quand run() échoue, et repropage l\'erreur', async () => {
  const events = []
  const listener = (e) => events.push(e)
  onCall(listener)
  await assert.rejects(
    traceCall(
      { vm: 'llm', kind: 'llm', sentSummary: 'sent', sentDetail: {}, describeResult: () => ({}) },
      async () => { throw new Error('boom') },
    ),
    /boom/,
  )
  offCall(listener)
  assert.equal(events.length, 2)
  assert.equal(events[1].direction, 'error')
  assert.match(events[1].summary, /boom/)
})
