import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emitCall, onCall, offCall, truncateDetail, traceCall, turnContext } from './callEvents.js'

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

test('traceCall partage le même callId entre sent et received', async () => {
  const events = []
  const listener = (e) => events.push(e)
  onCall(listener)
  await traceCall({
    vm: 'mcp', kind: 'mcp', sentSummary: 'sent', sentDetail: {},
    describeResult: () => ({ summary: 'ok', detail: {} }),
  }, async () => 'ok')
  offCall(listener)
  assert.equal(events.length, 2)
  assert.ok(events[0].callId)
  assert.equal(events[0].callId, events[1].callId)
})

test('traceCall partage le même callId entre sent et error', async () => {
  const events = []
  const listener = (e) => events.push(e)
  onCall(listener)
  await assert.rejects(
    traceCall(
      { vm: 'llm', kind: 'llm', sentSummary: 'sent', sentDetail: {}, describeResult: () => ({}) },
      async () => { throw new Error('boom') },
    ),
  )
  offCall(listener)
  assert.ok(events[0].callId)
  assert.equal(events[0].callId, events[1].callId)
})

test('emitCall estampille turnId depuis turnContext', () => {
  const events = []
  const listener = (e) => events.push(e)
  onCall(listener)
  turnContext.run({ turnId: 't_abc' }, () => {
    emitCall({ vm: 'llm', kind: 'llm', direction: 'sent', ts: 1, summary: 'x', detail: {} })
  })
  offCall(listener)
  assert.equal(events[0].turnId, 't_abc')
})

test('emitCall a un turnId null hors de tout contexte', () => {
  const events = []
  const listener = (e) => events.push(e)
  onCall(listener)
  emitCall({ vm: 'llm', kind: 'llm', direction: 'sent', ts: 1, summary: 'x', detail: {} })
  offCall(listener)
  assert.equal(events[0].turnId, null)
})

test('turnContext isole deux tours entrelacés', async () => {
  const events = []
  const listener = (e) => events.push(e)
  onCall(listener)
  await Promise.all([
    turnContext.run({ turnId: 'A' }, async () => {
      emitCall({ callId: 'a1', vm: 'llm', kind: 'llm', direction: 'sent', ts: 1, summary: 'a-sent', detail: {} })
      await new Promise((resolve) => setTimeout(resolve, 10))
      emitCall({ callId: 'a1', vm: 'llm', kind: 'llm', direction: 'received', ts: 2, summary: 'a-received', detail: {} })
    }),
    turnContext.run({ turnId: 'B' }, async () => {
      emitCall({ callId: 'b1', vm: 'mcp', kind: 'mcp', direction: 'sent', ts: 1, summary: 'b-sent', detail: {} })
      await new Promise((resolve) => setTimeout(resolve, 5))
      emitCall({ callId: 'b1', vm: 'mcp', kind: 'mcp', direction: 'received', ts: 2, summary: 'b-received', detail: {} })
    }),
  ])
  offCall(listener)
  const aEvents = events.filter((e) => e.turnId === 'A')
  const bEvents = events.filter((e) => e.turnId === 'B')
  assert.equal(aEvents.length, 2)
  assert.equal(bEvents.length, 2)
  assert.ok(aEvents.every((e) => e.callId === 'a1'))
  assert.ok(bEvents.every((e) => e.callId === 'b1'))
})
