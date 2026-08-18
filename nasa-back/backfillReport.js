// Read-only report over the turns logged before the Families feature existed.
//
// Proves derivability of prompt_key / condition / used_mcp_tool WITHOUT
// writing anything anywhere — see SPEC_families.md §5 and the "backfill
// schema" decision: all three are pure functions of data turns.jsonl
// already carries (prompt text, and the `calls` merged in by
// sessionLog.readLogs()), so there is nothing to append to families.jsonl
// for old turns. "Retro-tagging" an old turn only ever means assigning it
// to a family later, through the normal assign endpoint — an ordinary
// `assignment` line, not a special unlock step run here.
//
// This script only reads turns.jsonl (via sessionLog.readLogs(), the same
// path GET /api/logs uses) and checksums it before/after, to make the
// "never touched" guarantee something you can see rather than take on
// faith. Run once with: node nasa-back/backfillReport.js
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import crypto from 'crypto'
import * as sessionLog from './sessionLog.js'
import { derivePromptKey, deriveCondition, deriveUsedMcpTool } from './turnDerive.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TURNS_FILE = path.join(__dirname, 'logs', 'turns.jsonl')

function checksum() {
  if (!fs.existsSync(TURNS_FILE)) return null
  return crypto.createHash('sha256').update(fs.readFileSync(TURNS_FILE)).digest('hex')
}

function main() {
  const before = checksum()
  const turns = sessionLog.readLogs().flatMap((session) => session.turns)

  const rows = turns.map((turn) => ({
    id: turn.id,
    prompt: turn.prompt?.length > 40 ? `${turn.prompt.slice(0, 40)}…` : turn.prompt,
    prompt_key: derivePromptKey(turn),
    ...deriveCondition(turn),
    used_mcp_tool: deriveUsedMcpTool(turn),
  }))

  const after = checksum()

  console.log(`turns.jsonl: ${turns.length} turn(s)`)
  console.log(`checksum before: ${before}`)
  console.log(`checksum after:  ${after}`)
  if (before !== after) {
    console.error('turns.jsonl CHANGED during this run — this must never happen. Aborting.')
    process.exitCode = 1
    return
  }
  console.log('turns.jsonl is byte-identical — nothing was written to it.')
  console.log('Nothing was appended to families.jsonl either: prompt_key/condition/used_mcp_tool')
  console.log('are read-time derivations for old turns, not stored facts (see file header).')
  console.log('')

  const usedTrue = rows.filter((r) => r.used_mcp_tool === true).length
  const usedFalse = rows.filter((r) => r.used_mcp_tool === false).length
  const usedUnknown = rows.filter((r) => r.used_mcp_tool === null).length
  const inferredCondition = rows.filter((r) => r.inferred).length

  console.log(`used_mcp_tool: ${usedTrue} true, ${usedFalse} false, ${usedUnknown} unknown (null — predates call-pins instrumentation)`)
  console.log(`condition: ${inferredCondition}/${rows.length} inferred as 'authorized' (no explicit condition stored on the turn)`)
  console.log('')
  console.table(rows)
}

main()
