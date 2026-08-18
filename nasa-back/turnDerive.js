// Pure derivations for a logged turn — no I/O, no knowledge of families.jsonl.
//
// `prompt_key` and `used_mcp_tool` are pure functions of fields a turn
// already carries (`prompt`, and `calls` once merged in by
// sessionLog.readLogs()), so they need no persistence for the 21 turns that
// predate this feature — they're computed identically for old and new
// turns. `condition` is the one exception: for turns before this feature
// existed, nobody actually chose a condition, so there is nothing to
// recover — only a single fallback rule to apply ('authorized', flagged
// inferred). See SPEC_families.md §5 and the "backfill schema" decision.
import { createHash } from 'crypto'

export function normalizePrompt(text) {
  return String(text ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

// Decision 4: SHA-1 of the normalized prompt — the local equivalent of
// `question_id` in scores.jsonl, and what links the 3 conditions of one
// question.
export function promptKey(text) {
  return `sha1:${createHash('sha1').update(normalizePrompt(text)).digest('hex')}`
}

// Turns logged before this feature have no `prompt_key` field — derive it
// from the stored prompt text instead of leaving it undefined.
export function derivePromptKey(turn) {
  return turn?.prompt_key ?? promptKey(turn?.prompt)
}

// Every turn before this feature had the MCP available and the LLM free to
// call it — that's `authorized`, factually, not a guess. Turns written by
// this feature always carry an explicit `condition`, so this fallback only
// ever fires on old data.
export function deriveCondition(turn) {
  if (turn?.condition) return { condition: turn.condition, inferred: false }
  return { condition: 'authorized', inferred: true }
}

// `null` (unknown) when the turn predates call-pins instrumentation and has
// no `calls` line at all — never `false`. Absence of evidence isn't
// evidence of absence (SPEC §5 / same discipline as the ungraded rule §6).
// `turn.calls` here is the array sessionLog.readLogs() merges in from the
// turn's `type: "calls"` line, NOT the (always-empty, unrelated) `tools_called`
// field on the turn itself.
export function deriveUsedMcpTool(turn) {
  if (!Array.isArray(turn?.calls)) return null
  return turn.calls.some((call) => call.vm === 'mcp')
}
