// Persistance JSONL des tours de chat — append-only, jamais de réécriture.
// Module isolé : aucune connaissance des providers ni du routage (voir spec
// §7 étape 3), pour que l'étape 4 n'ait qu'à déplacer le site d'appel.
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOG_DIR = path.join(__dirname, 'logs')
const LOG_FILE = path.join(LOG_DIR, 'turns.jsonl')

function appendLine(entry) {
  fs.mkdirSync(LOG_DIR, { recursive: true })
  fs.appendFileSync(LOG_FILE, `${JSON.stringify(entry)}\n`)
}

// { id, ts, session_id, session_name, provider, provider_kind, prompt, reply,
//   route, tools_called, metrics }
export function appendTurn(turn) {
  appendLine({ type: 'turn', ...turn })
}

// { window_s, vms } — voir lib/sampling.js côté front pour la forme de `vms`
export function appendSampling(turnId, sampling) {
  appendLine({ type: 'sampling', turn_id: turnId, ...sampling })
}

// calls: résumés + timings seulement, pas de payloads (voir callAggregate.js
// et v2 §6.1) — c'est ce qui garde readLogs() bon marché malgré la relecture
// intégrale du fichier à chaque GET /api/logs.
export function appendCalls(turnId, calls) {
  appendLine({ type: 'calls', turn_id: turnId, calls })
}

function readEntries() {
  if (!fs.existsSync(LOG_FILE)) return []
  return fs
    .readFileSync(LOG_FILE, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return null
      }
    })
    .filter(Boolean)
}

// Fusionne les lignes turn/sampling par turn_id et groupe par session.
// Sessions triées antéchronologiquement (dernier tour le plus récent en tête),
// tours dans l'ordre chronologique à l'intérieur d'une session.
export function readLogs() {
  const turnsById = new Map()
  const sessionOrder = []
  const sessions = new Map()

  for (const entry of readEntries()) {
    if (entry.type === 'turn') {
      const { type: _type, ...turn } = entry
      const withSampling = { ...turn, sampling: null, calls: null }
      turnsById.set(turn.id, withSampling)
      if (!sessions.has(turn.session_id)) {
        sessions.set(turn.session_id, {
          session_id: turn.session_id,
          session_name: turn.session_name,
          turns: [],
        })
        sessionOrder.push(turn.session_id)
      }
      sessions.get(turn.session_id).turns.push(withSampling)
    } else if (entry.type === 'sampling') {
      const turn = turnsById.get(entry.turn_id)
      if (turn) turn.sampling = { window_s: entry.window_s, vms: entry.vms }
    } else if (entry.type === 'calls') {
      const turn = turnsById.get(entry.turn_id)
      if (turn) turn.calls = entry.calls
    }
  }

  return sessionOrder
    .map((id) => sessions.get(id))
    .sort((a, b) => {
      const aLast = a.turns[a.turns.length - 1]?.ts ?? ''
      const bLast = b.turns[b.turns.length - 1]?.ts ?? ''
      return bLast.localeCompare(aLast)
    })
}
