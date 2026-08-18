// Express backend for the Orbit dashboard — orchestrateur multi-provider.
// - GET  /api/metrics    : snapshot dashboard (mock.js)
// - GET  /api/vm-metrics : agents psutil (LLM + MCP), métriques infra
// - GET  /api/providers  : liste des cibles LLM (Ollama local / EC2 / Claude / Lambda)
// - POST /api/chat       : { message, provider, session_id, session_name } -> dispatch
//   vers le bon provider (chaque provider gère son propre tool-calling avec le MCP et
//   renvoie turnMetrics), journalise le tour et renvoie turn_id
// - POST /api/turns/:id/sampling : carottage CPU/RAM posté par le front après coup
// - GET  /api/logs       : sessions + tours fusionnés, antéchronologique
// - GET  /api/families, POST /api/families, DELETE /api/families/:id,
//   POST /api/families/:id/assign, POST /api/families/unassign,
//   PUT /api/prompts/:promptKey/expectation, POST /api/turns/:id/grade :
//   Families sub-tab (SPEC_families.md §5) — familyLog.js does the I/O,
//   this stays the only orchestrator.
import { randomUUID } from 'crypto'
import express from 'express'
import { getMockMetrics, recordChatTurn } from './mock.js'
import * as mcpClient from './mcpClient.js'
import * as providers from './providers.js'
import * as sessionLog from './sessionLog.js'
import * as familyLog from './familyLog.js'
import { onCall, offCall, turnContext } from './callEvents.js'
import { aggregateCalls } from './callAggregate.js'
import { promptKey, derivePromptKey, deriveCondition, deriveUsedMcpTool } from './turnDerive.js'
import { autoGrade } from './autoGrade.js'
const app = express()
const PORT = Number(process.env.PORT) || 3001
app.use(express.json())

// Conditions the backend can actually produce today (SPEC_families.md §5/§10).
// 'forced' is a valid value everywhere else in storage/UI, but nothing
// implements forcing a tool call yet — accepting it here would silently log
// a run under a condition nobody measured.
const CHAT_CONDITIONS = ['authorized', 'no-mcp']

app.get('/api/metrics', (req, res) => {
  res.json(getMockMetrics())
})

app.get('/api/providers', async (req, res) => {
  try {
    res.json({ providers: await providers.listProviders() })
  } catch (e) {
    res.status(502).json({ error: e.message, providers: [] })
  }
})

app.post('/api/chat', async (req, res) => {
  const {
    message, provider, session_id: sessionId, session_name: sessionName,
    condition = 'authorized',
  } = req.body ?? {}
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' })
  }
  // A typo must not silently log a run under the wrong condition — reject
  // rather than default (SPEC §5.4).
  if (!CHAT_CONDITIONS.includes(condition)) {
    return res.status(400).json({ error: `condition must be one of: ${CHAT_CONDITIONS.join(', ')}` })
  }

  // turnId généré AVANT le dispatch (pas après, comme en v1) pour pouvoir
  // l'utiliser à la fois comme contexte async (turnContext.run) et comme
  // filtre du collecteur ci-dessous — voir v2 §6.4.
  const turnId = `t_${randomUUID()}`
  const collected = []
  const collector = (event) => {
    // Le bus est global : sans ce filtre, deux tours simultanés (deux
    // onglets ouverts) verraient chacun leur collecteur ramasser les appels
    // de l'autre.
    if (event.turnId === turnId) collected.push(event)
  }
  onCall(collector)

  try {
    // no-mcp: pass zero tools instead of the cached MCP list.
    const tools = condition === 'no-mcp' ? [] : mcpClient.getTools()
    const { reply, turnMetrics, toolsCalled = [] } = await turnContext.run({ turnId }, () => providers.dispatch(provider, {
      message,
      tools,
      callTool: mcpClient.callTool,
    }))
    recordChatTurn({
      promptTokens: turnMetrics.prompt_tokens,
      completionTokens: turnMetrics.completion_tokens,
      latencyMs: turnMetrics.latency_ms,
      llmLatencyMs: turnMetrics.llm_latency_ms,
      overheadMs: turnMetrics.overhead_ms,
      llmCalls: turnMetrics.llm_calls,
      costUsd: turnMetrics.cost_usd,
    })

    const pk = promptKey(message)
    sessionLog.appendTurn({
      id: turnId,
      ts: new Date().toISOString(),
      session_id: sessionId || 'default',
      session_name: sessionName || 'Session',
      provider: provider || null,
      provider_kind: turnMetrics.provider_kind ?? null,
      prompt: message,
      prompt_key: pk,
      condition,
      reply,
      route: 'llm-full',
      tools_called: toolsCalled,
      metrics: turnMetrics,
    })

    const calls = aggregateCalls(collected)
    if (calls.length) sessionLog.appendCalls(turnId, calls)

    // "graded ... at log time for new ones" (SPEC §6): if this prompt
    // already has an auto-gradable expectation, grade the reply immediately
    // instead of waiting for someone to open the tab.
    const existingExpectation = familyLog.readFamiliesState()
      .expectations.find((e) => e.prompt_key === pk)
    if (existingExpectation) {
      const grade = autoGrade(reply, existingExpectation)
      if (grade) familyLog.appendGrade(turnId, grade)
    }

    res.json({ reply, turnMetrics, turn_id: turnId })
  } catch (err) {
    console.error('[chat] error:', err.message)
    res.status(502).json({ error: err.message || 'Failed to answer' })
  } finally {
    offCall(collector)
  }
})

app.post('/api/turns/:id/sampling', (req, res) => {
  const { window_s: windowS, vms } = req.body ?? {}
  if (typeof windowS !== 'number' || !vms) {
    return res.status(400).json({ error: 'window_s and vms are required' })
  }
  sessionLog.appendSampling(req.params.id, { window_s: windowS, vms })
  res.status(204).end()
})

app.get('/api/logs', (req, res) => {
  res.json({ sessions: sessionLog.readLogs() })
})

// --- Families sub-tab (SPEC_families.md §5) ---------------------------------

// 'manual' is a valid match mode (SPEC §6: mode lives on the expectation,
// "the question decides how it can be graded") — it just has no auto engine.
const EXPECTATION_MATCH_MODES = ['contains', 'regex', 'manual']

// Every turn, decorated with the fields families.js needs to group/aggregate.
// prompt_key/condition/used_mcp_tool are read-time derivations (see
// turnDerive.js): turns written before this feature existed get them via
// fallback, turns written by it already carry prompt_key/condition inline
// and the fallback is a no-op. Nothing is persisted for old turns — see the
// "backfill schema" decision recorded when step 2 shipped.
function decoratedTurns() {
  return sessionLog.readLogs().flatMap((session) => session.turns).map((turn) => ({
    ...turn,
    prompt_key: derivePromptKey(turn),
    ...deriveCondition(turn),
    used_mcp_tool: deriveUsedMcpTool(turn),
  }))
}

// Not itemized in SPEC §5's route table (which lists only families /
// assignments / expectations / grades), but src/lib/families.js is
// documented as "replay of the /api/families payload" for grouping and
// aggregation — that needs turn-level data (cost, tokens, condition), so
// this response also carries `turns`, already decorated. GET /api/logs stays
// untouched (unchanged contract, CLAUDE.md).
app.get('/api/families', (req, res) => {
  const turns = decoratedTurns()
  const validTurnIds = new Set(turns.map((turn) => turn.id))
  res.json({ ...familyLog.readFamiliesState(validTurnIds), turns })
})

app.post('/api/families', (req, res) => {
  const { id, name, description } = req.body ?? {}
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name is required' })
  }
  // The description is the sentence read aloud to a client — a family
  // without one is just a folder (SPEC §5 validation).
  if (typeof description !== 'string' || !description.trim()) {
    return res.status(400).json({ error: 'description is required' })
  }
  const familyId = id || `fam_${randomUUID().slice(0, 8)}`
  familyLog.appendFamily({ id: familyId, name: name.trim(), description: description.trim() })
  res.status(201).json({ id: familyId })
})

app.delete('/api/families/:id', (req, res) => {
  const { families } = familyLog.readFamiliesState()
  const existing = families.find((family) => family.id === req.params.id)
  if (!existing) return res.status(404).json({ error: 'family not found' })
  // Re-append the FULL object: readFamiliesState() replaces by id rather
  // than merging, so a delete line missing name/description would erase them.
  familyLog.appendFamily({ id: existing.id, name: existing.name, description: existing.description, deleted: true })
  res.status(204).end()
})

app.post('/api/families/:id/assign', (req, res) => {
  const { turn_ids: turnIds } = req.body ?? {}
  if (!Array.isArray(turnIds) || turnIds.length === 0) {
    return res.status(400).json({ error: 'turn_ids must be a non-empty array' })
  }
  const { families } = familyLog.readFamiliesState()
  const family = families.find((item) => item.id === req.params.id && !item.deleted)
  if (!family) return res.status(404).json({ error: 'family not found' })
  turnIds.forEach((turnId) => familyLog.appendAssignment(turnId, req.params.id))
  res.status(204).end()
})

app.post('/api/families/unassign', (req, res) => {
  const { turn_ids: turnIds } = req.body ?? {}
  if (!Array.isArray(turnIds) || turnIds.length === 0) {
    return res.status(400).json({ error: 'turn_ids must be a non-empty array' })
  }
  turnIds.forEach((turnId) => familyLog.appendAssignment(turnId, null))
  res.status(204).end()
})

app.put('/api/prompts/:promptKey/expectation', (req, res) => {
  const { expected_items: expectedItems, match } = req.body ?? {}
  if (!Array.isArray(expectedItems) || expectedItems.length === 0) {
    return res.status(400).json({ error: 'expected_items must be a non-empty array' })
  }
  if (!EXPECTATION_MATCH_MODES.includes(match)) {
    return res.status(400).json({ error: `match must be one of: ${EXPECTATION_MATCH_MODES.join(', ')}` })
  }
  const expectation = { expected_items: expectedItems, match }
  familyLog.appendExpectation(req.params.promptKey, expectation)

  // "graded ... on demand for old turns" (SPEC §6): setting or changing an
  // auto-gradable expectation (re-)grades every turn that already exists for
  // this prompt, not just future ones. A 'manual' expectation grades nothing
  // here — that's POST /api/turns/:id/grade's job.
  if (match !== 'manual') {
    decoratedTurns()
      .filter((turn) => turn.prompt_key === req.params.promptKey)
      .forEach((turn) => {
        const grade = autoGrade(turn.reply, expectation)
        if (grade) familyLog.appendGrade(turn.id, grade)
      })
  }

  res.status(204).end()
})

// Manual grade for one run (SPEC §5/§6). Rejected when the prompt's current
// expectation says it's auto-graded — mode lives on the prompt, not the run,
// so a one-off manual override would contradict "the question decides how it
// can be graded". Change the expectation to 'manual' first to grade by hand.
app.post('/api/turns/:id/grade', (req, res) => {
  const { expected_count: expectedCount, matched_count: matchedCount, found_count: foundCount } = req.body ?? {}
  const counts = [expectedCount, matchedCount, foundCount]
  if (!counts.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0)) {
    return res.status(400).json({ error: 'expected_count, matched_count and found_count must be non-negative numbers' })
  }

  const turn = decoratedTurns().find((item) => item.id === req.params.id)
  if (!turn) return res.status(404).json({ error: 'turn not found' })
  const expectation = familyLog.readFamiliesState()
    .expectations.find((e) => e.prompt_key === turn.prompt_key)
  if (expectation && expectation.match !== 'manual') {
    return res.status(400).json({
      error: "this prompt is graded automatically — set its expectation's match to 'manual' to grade it by hand",
    })
  }

  familyLog.appendGrade(req.params.id, {
    expected_count: expectedCount,
    matched_count: matchedCount,
    found_count: foundCount,
    mode: 'manual',
    graded_by: 'manual',
  })
  res.status(204).end()
})

// GET /api/call-events — flux SSE des appels LLM/MCP en direct (voir callEvents.js).
app.get('/api/call-events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  res.flushHeaders?.()

  const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`)
  onCall(send)

  // Un commentaire SSE toutes les 20 s pour garder la connexion vivante à
  // travers les proxys (nginx, le proxy dev de Vite) qui coupent une
  // connexion HTTP silencieuse au bout de ~30-60 s.
  const keepAlive = setInterval(() => res.write(': ping\n\n'), 20000)

  req.on('close', () => {
    clearInterval(keepAlive)
    offCall(send)
  })
})

// GET /api/vm-metrics — proxifie les agents psutil (côté serveur, même origine pour le navigateur)
const VM_AGENTS = {
  llm: process.env.ORBIT_AGENT_LLM_URL || 'http://172.18.53.7:9100/metrics',
  web: process.env.ORBIT_AGENT_WEB_URL || 'http://172.18.53.11:9100/metrics',
}
app.get('/api/vm-metrics', async (req, res) => {
  const out = {}
  await Promise.all(Object.entries(VM_AGENTS).map(async ([key, url]) => {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(2000) })
      out[key] = r.ok ? await r.json() : { error: `HTTP ${r.status}` }
    } catch (e) {
      out[key] = { error: e.message }
    }
  }))
  res.json(out)
})

async function start() {
  await mcpClient.init()
  app.listen(PORT, () => {
    console.log(`Orbit backend listening on http://localhost:${PORT}`)
  })
}
start().catch((err) => {
  console.error('Failed to start backend:', err.message)
  process.exit(1)
})
