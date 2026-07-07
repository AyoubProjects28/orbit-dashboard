import axios from 'axios'

const LLM_URL = 'http://172.18.53.7:11434'
const MCP_URL = 'http://172.18.53.9:8000'

async function searchDocuments(query) {
  try {
    const response = await axios.post(`${MCP_URL}/api/v1/search_documents`, { query })
    return response.data.results || []
  } catch (error) {
    console.error('MCP search failed:', error.message)
    return []
  }
}

async function listAllDocuments() {
  try {
    const response = await axios.post(`${MCP_URL}/api/v1/list_documents`, {})
    return response.data.documents || []
  } catch (error) {
    console.error('MCP list failed:', error.message)
    return []
  }
}

async function readDocument(filePath) {
  try {
    const response = await axios.post(`${MCP_URL}/api/v1/read_document`, { file_path: filePath })
    return response.data.content || ''
  } catch (error) {
    console.error('MCP read failed:', error.message)
    return ''
  }
}

export async function getMockChatReply(message) {
  const startTime = Date.now()

  try {
    console.log(`[chat] Pre-processing: fetching documents...`)
    
    let results = await searchDocuments(message)
    
    if (results.length === 0) {
      console.log(`[chat] No search results, listing all documents...`)
      results = await listAllDocuments()
    }
    
    console.log(`[chat] Found ${results.length} documents`)

    let documentContext = 'DOCUMENTS DISPONIBLES:\n'
    
    if (results.length > 0) {
      results.forEach((doc, idx) => {
        documentContext += `${idx + 1}. ${doc.name} (${doc.size})\n`
      })
      
      for (const doc of results.slice(0, 3)) {
        const content = await readDocument(doc.path)
        if (content) {
          documentContext += `\n[${doc.name}]\n${content}\n`
        }
      }
    } else {
      documentContext += 'Aucun document disponible.'
    }

    const enrichedPrompt = `Tu es un assistant documentaire. Tu dois répondre UNIQUEMENT en te basant sur les documents suivants.
Tu n'as accès QU'À ces documents. Si l'information n'y est pas, dis-le clairement.

DOCUMENTS DISPONIBLES:
${documentContext}

Question de l'utilisateur: "${message}"

Instructions strictes:
1. Réponds UNIQUEMENT basé sur les documents ci-dessus
2. N'utilise JAMAIS tes connaissances générales
3. Si la réponse n'est pas dans les documents, dis: "Cette information n'est pas disponible dans nos documents"
4. Cite toujours le document d'où vient l'information`

    console.log(`[chat] Calling Ollama with grounded context (${documentContext.length} chars)`)
    
    const response = await axios.post(
      `${LLM_URL}/api/generate`,
      {
        model: 'qwen:7b',
        prompt: enrichedPrompt,
        stream: false
      },
      { timeout: 120000 }
    )

    const reply = response.data.response
    const promptTokens = Math.round(message.split(/\s+/).length * 1.3)
    const completionTokens = response.data.eval_count || Math.round(reply.split(/\s+/).length * 1.3)
    const costUsd = (promptTokens + completionTokens) * 0.000005
    const totalLatencyMs = Date.now() - startTime

    console.log(`[chat] Response grounded in ${results.length} documents`)

    return {
      reply,
      turnMetrics: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
        latency_ms: totalLatencyMs,
        cost_usd: Number(costUsd.toFixed(6))
      }
    }
  } catch (error) {
    console.error('[chat] Error:', error.message)
    throw error
  }
}
