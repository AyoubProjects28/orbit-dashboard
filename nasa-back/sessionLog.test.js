import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { appendTurn, appendCalls, readLogs } from './sessionLog.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOG_FILE = path.join(__dirname, 'logs', 'turns.jsonl')
const BACKUP_FILE = `${LOG_FILE}.bak`

beforeEach(() => {
  if (fs.existsSync(LOG_FILE)) fs.renameSync(LOG_FILE, BACKUP_FILE)
})

afterEach(() => {
  if (fs.existsSync(LOG_FILE)) fs.rmSync(LOG_FILE)
  if (fs.existsSync(BACKUP_FILE)) fs.renameSync(BACKUP_FILE, LOG_FILE)
})

function baseTurn(id) {
  return {
    id, ts: '2026-08-04T00:00:00.000Z', session_id: 's1', session_name: 'S',
    provider: 'ollama:qwen', provider_kind: 'infra', prompt: 'p', reply: 'r',
    route: 'llm-full', tools_called: [], metrics: {},
  }
}

test('appendCalls écrit une ligne de type calls', () => {
  appendTurn(baseTurn('t1'))
  appendCalls('t1', [{ seq: 1, vm: 'llm', summary_sent: 'a', summary_received: 'b', ts0: 1, ts1: 2, latency_ms: 1000, status: 'done' }])
  const lines = fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  assert.equal(lines[1].type, 'calls')
  assert.equal(lines[1].turn_id, 't1')
  assert.equal(lines[1].calls.length, 1)
})

test('readLogs refusionne les appels dans leur tour par turn_id', () => {
  appendTurn(baseTurn('t1'))
  appendCalls('t1', [{ seq: 1, vm: 'llm', summary_sent: 'a', summary_received: 'b', ts0: 1, ts1: 2, latency_ms: 1000, status: 'done' }])
  const [session] = readLogs()
  assert.equal(session.turns[0].calls.length, 1)
  assert.equal(session.turns[0].calls[0].summary_sent, 'a')
})

test('un tour sans ligne calls a un champ calls null, pas d\'erreur', () => {
  appendTurn(baseTurn('t1'))
  const [session] = readLogs()
  assert.equal(session.turns[0].calls, null)
})
