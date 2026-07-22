// One-shot, pure decision function for document questions.
// Given the raw message and the live MCP tool list, selectTools() decides
// WHICH tool(s) are relevant — never the arguments, and it never touches
// the MCP or the LLM itself. index.js executes the decision:
//   - mode 'deterministic': the tool AND its argument are both already
//     certain (e.g. list_documents with folder: '/', a fixed constant, not
//     derived from free text) — index.js calls it directly and formats the
//     reply with formatDeterministicReply(). Zero LLM calls.
//   - mode 'llm-args': the argument (a filename, a search query) has to be
//     extracted from free text, which regex can get wrong. So the LLM is
//     restricted to just these candidate tools (instead of the full list)
//     and picks the argument itself, over the normal tool-calling loop.
//   - resolved: false: no document intent matched, or the matched tool(s)
//     no longer exist on the live MCP tool list — index.js falls back to
//     the full LLM tool-calling loop with every cached tool.
const INTENT_PATTERNS = {
  read: /\b(read|reads|reading|content|contents|summar(?:y|ize|ise|izes|ization)|analy(?:ze|se|sis|zes)|describe|describes|explain|explains|explanation|inspect|inspects|detail|details|what(?:'s| is)\s+(?:in|inside)|tell me about|walk me through)\b/i,
  count: /\b(how many|count|number of|total number|amount of)\b/i,
  volume: /\b(size|sizes|sized|volume|weight|bytes?|space|disk|storage|how (?:big|much space|large))\b/i,
  date: /\b(date|dates|dated|when|recent|recently|latest|newest|last modified|modification|updated)\b/i,
  search: /\b(search|find|finds|finding|regarding|concerning|related to|keyword|containing|contains|look for|looking for)\b/i,
  list: /\b(list|lists|listing|available|show|shows|display|displays|which files?|which documents?|what files?|what documents?|folder|directory|files?|documents?)\b/i,
}

// Return a flags object with true/false for each intent, or null if no intent matched.
function classify(message) {
  const flags = {}
  let matchedAny = false
  for (const [intent, pattern] of Object.entries(INTENT_PATTERNS)) {
    const matched = pattern.test(message)
    flags[intent] = matched
    matchedAny = matchedAny || matched
  }
  return matchedAny ? flags : null
}

function parseSize(size) {
  if (typeof size === 'number') return size
  if (!size) return 0
  const match = String(size).match(/([\d.]+)\s*(bytes?|kb|mb|gb)?/i)
  if (!match) return 0
  const amount = parseFloat(match[1])
  const unit = (match[2] || 'bytes').toLowerCase()
  const multiplier = unit.startsWith('k') ? 1024 : unit.startsWith('m') ? 1048576 : unit.startsWith('g') ? 1073741824 : 1
  return Math.round(amount * multiplier)
}

function humanSize(bytes) {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} bytes`
}

// tools: the live cached MCP tool list ({name, description, inputSchema}[])
// from mcpClient.getTools() — used only to confirm a candidate tool name
// still exists, so a renamed/removed MCP tool falls back to the LLM instead
// of silently failing.
export function selectTools(message, tools) {
  // Parsing the message to identify 
  const flags = classify(message)
  if (!flags) return { resolved: false }

  const knownNames = new Set(tools.map((tool) => tool.name))
  const wantsContent = flags.read || flags.search

  if (!wantsContent) {
    if (!knownNames.has('list_documents')) return { resolved: false }
    return {
      resolved: true,
      mode: 'deterministic',
      tool: 'list_documents',
      args: { folder: '/' },
      flags,
    }
  }

  // The exact filename/query is risky to guess from free text — the LLM
  // fills that in itself, restricted to these candidates.
  const candidates = flags.search
    ? ['search_documents', 'read_document']
    : ['list_documents', 'read_document']
  const toolNames = candidates.filter((name) => knownNames.has(name))
  if (!toolNames.length) return { resolved: false }

  return { resolved: true, mode: 'llm-args', tools: toolNames }
}

export function formatDeterministicReply(flags, docs) {
  const lines = []
  if (flags.count) {
    lines.push(`There are ${docs.length} file(s) in the folder.`)
  }
  if (flags.volume) {
    const totalBytes = docs.reduce((sum, doc) => sum + parseSize(doc.size), 0)
    lines.push(`Total size: ${humanSize(totalBytes)} (${totalBytes} bytes) across ${docs.length} file(s).`)
  }
  if (flags.date) {
    lines.push('File dates are not exposed by the current MCP (only name, size and path are available).')
  }
  if (flags.list || (!flags.count && !flags.volume && !flags.date)) {
    lines.push('Files in the folder:')
    docs.forEach((doc) => lines.push(`- ${doc.name} (${doc.size})`))
  }
  return lines.join('\n')
}
