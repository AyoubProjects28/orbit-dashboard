// Routage déterministe des questions documentaires (FR + EN).
// Le BACKEND décide de l'action à partir de l'intention détectée dans le message,
// appelle le MCP lui-même (pas le LLM), calcule compte/volume directement,
// et n'utilise le LLM QUE pour rédiger une réponse de contenu, dans la langue de l'utilisateur.
import * as mcpClient from './mcpClient.js'
import { chat } from './chatClient.js'

// --- helpers MCP ---
function mcpText(result) {
  return result?.content?.[0]?.text ?? ''
}
function parseMcpJson(result) {
  const text = mcpText(result)
  if (!text) return {}
  try { return JSON.parse(text) } catch { return {} }
}
function readContent(result) {
  const text = mcpText(result)
  if (!text) return ''
  try { const j = JSON.parse(text); return j.content ?? j.text ?? text } catch { return text }
}
function parseSize(s) {
  if (typeof s === 'number') return s
  if (!s) return 0
  const m = String(s).match(/([\d.]+)\s*(bytes?|o|ko|kb|mo|mb|go|gb)?/i)
  if (!m) return 0
  const n = parseFloat(m[1]); const u = (m[2] || 'bytes').toLowerCase()
  const mult = u.startsWith('k') ? 1024 : u.startsWith('m') ? 1048576 : u.startsWith('g') ? 1073741824 : 1
  return Math.round(n * mult)
}
function humanSize(b) {
  if (b >= 1048576) return (b / 1048576).toFixed(1) + ' Mo'
  if (b >= 1024) return (b / 1024).toFixed(1) + ' Ko'
  return b + ' octets'
}

// --- langue & intentions ---
function detectLang(msg) {
  if (/[àâçéèêëîïôûùü]/i.test(msg)) return 'fr'
  const fr = (msg.match(/\b(le|les|moi|tout|tous|fichier|fichiers|repertoire|contenu|combien|taille|liste|lis|lire|documents?|quels?|dossier|donne|montre)\b/gi) || []).length
  const en = (msg.match(/\b(the|files?|folder|list|read|content|show|how|many|size|count|all|give|what|and)\b/gi) || []).length
  return en > fr ? 'en' : 'fr'
}
function intents(m) {
  return {
    read:   /(lis|lire|lit|contenu|conten|contien|contient|résum|resum|analys|décri|decri|explique|expliqu|read|content|summar|analyz|describe|explain|inspect|détail|detail)/i.test(m),
    count:  /(combien|nombre|compte|compter|count|how many)/i.test(m),
    volume: /(taille|tailles|volume|poids|octet|byte|size|weight|espace|space|disque|disk)/i.test(m),
    date:   /(date|dates|quand|récent|recent|dernier|derni[eè]re|latest|modif|when)/i.test(m),
    search: /(cherche|recherch|trouve|trouver|à propos|a propos|concernant|au sujet|search|find|about|regarding|mot.?cl[eé]|keyword)/i.test(m),
    list:   /(list|liste|lister|montre|affiche|quels|quelles|show|display|available|disponible|repertoire|folder|files?|fichiers?|documents?)/i.test(m),
  }
}
function extractQuery(msg) {
  const stop = new Set(['cherche','recherche','recherche','trouve','trouver','sur','propos','concernant','sujet','les','des','dans','fichier','fichiers','document','documents','moi','tout','tous','search','find','about','regarding','the','for','file','files','please','what','contain','contient'])
  const words = msg.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(w => w.length > 2 && !stop.has(w))
  return words.slice(0, 6).join(' ')
}

function finalize(reply, m, t0) {
  const total = Date.now() - t0
  const llm = (m.loadMs || 0) + (m.promptEvalMs || 0) + (m.genMs || 0)
  return {
    reply,
    turnMetrics: {
      prompt_tokens: m.promptTokens || 0,
      completion_tokens: m.completionTokens || 0,
      total_tokens: (m.promptTokens || 0) + (m.completionTokens || 0),
      latency_ms: total,
      llm_latency_ms: llm,
      overhead_ms: Math.max(0, total - llm),
      load_ms: m.loadMs || 0,
      prompt_eval_ms: m.promptEvalMs || 0,
      gen_ms: m.genMs || 0,
      llm_calls: m.llmCalls || 0,
      cost_usd: Number((m.costUsd || 0).toFixed(6)),
    },
  }
}

export async function answer(message, model) {
  const t0 = Date.now()
  const lang = detectLang(message)
  const it = intents(message)
  const t = (fr, en) => (lang === 'fr' ? fr : en)
  const metrics = { llmCalls: 0, loadMs: 0, promptEvalMs: 0, genMs: 0, promptTokens: 0, completionTokens: 0, costUsd: 0 }

  // 1) Toujours lister le répertoire (source de vérité)
  let docs = []
  try {
    const listed = parseMcpJson(await mcpClient.callTool('list_documents', { folder: '/' }))
    docs = Array.isArray(listed.documents) ? listed.documents : []
  } catch (e) { docs = [] }

  // 2) Si recherche : restreindre via search_documents
  let scope = docs
  if (it.search) {
    const q = extractQuery(message)
    if (q) {
      try {
        const found = parseMcpJson(await mcpClient.callTool('search_documents', { query: q }))
        const res = found.results || found.documents || []
        if (res.length) scope = res
      } catch (e) { /* on garde tous les docs */ }
    }
  }

  const wantsContent = it.read || it.search

  // 3) Réponses DÉTERMINISTES (aucun LLM) : compte / volume / date / liste
  if (!wantsContent && (it.count || it.volume || it.date || it.list)) {
    const lines = []
    if (it.count) {
      lines.push(t(`Il y a ${docs.length} fichier(s) dans le répertoire.`,
                   `There are ${docs.length} file(s) in the folder.`))
    }
    if (it.volume) {
      const total = docs.reduce((s, d) => s + parseSize(d.size), 0)
      lines.push(t(`Volume total : ${humanSize(total)} (${total} octets), réparti sur ${docs.length} fichier(s).`,
                   `Total size: ${humanSize(total)} (${total} bytes) across ${docs.length} file(s).`))
    }
    if (it.date) {
      lines.push(t(`Les dates de fichiers ne sont pas exposées par le MCP actuel (seuls le nom, la taille et le chemin le sont).`,
                   `File dates are not exposed by the current MCP (only name, size and path are available).`))
    }
    if (it.list || (!it.count && !it.volume && !it.date)) {
      lines.push(t(`Fichiers du répertoire :`, `Files in the folder:`))
      docs.forEach(d => lines.push(`- ${d.name} (${d.size})`))
    }
    return finalize(lines.join('\n'), metrics, t0)
  }

  // 4) Contenu demandé : lire les docs puis UN SEUL appel LLM (rédaction dans la langue)
  const toRead = (scope.length ? scope : docs).slice(0, 8)
  let context = ''
  for (const d of toRead) {
    try {
      const r = await mcpClient.callTool('read_document', { file_path: d.path })
      const content = readContent(r)
      if (content) context += `### ${d.name} (${d.size})\n${content}\n\n`
    } catch (e) { /* doc ignoré */ }
  }
  if (!context) {
    return finalize(t('Aucun contenu lisible dans les documents disponibles.',
                      'No readable content in the available documents.'), metrics, t0)
  }

  const sys = t(
    `Tu es un assistant documentaire. Réponds STRICTEMENT en français, de façon claire et concise. Utilise UNIQUEMENT les documents ci-dessous ; n'invente aucun dossier, fichier ou information. Si l'information demandée n'y figure pas, dis-le simplement.\n\nDOCUMENTS DISPONIBLES :\n${context}`,
    `You are a document assistant. Answer STRICTLY in English, clearly and concisely. Use ONLY the documents below; never invent any folder, file or information. If the requested info is not present, just say so.\n\nAVAILABLE DOCUMENTS:\n${context}`
  )
  const { message: assistant, turnMetrics } = await chat(
    [{ role: 'system', content: sys }, { role: 'user', content: message }],
    [], // aucun tool : le LLM ne fait que rédiger
    model
  )
  metrics.llmCalls = 1
  metrics.loadMs = turnMetrics.load_ms || 0
  metrics.promptEvalMs = turnMetrics.prompt_eval_ms || 0
  metrics.genMs = turnMetrics.gen_ms || 0
  metrics.promptTokens = turnMetrics.prompt_tokens || 0
  metrics.completionTokens = turnMetrics.completion_tokens || 0
  metrics.costUsd = turnMetrics.cost_usd || 0
  return finalize(assistant?.content || '', metrics, t0)
}
