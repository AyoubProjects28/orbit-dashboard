// Registre des providers LLM + dispatch. Chaque cible déclare une capacité de
// métriques : 'infra' (CPU/RAM via agents psutil) ou 'tokens' (usage API).
import * as ollama from './providerOllama.js'
import * as claude from './providerClaude.js'
import * as lambda from './providerLambda.js'

const env = process.env
const LLM_URL = env.ORBIT_LLM_URL || 'http://172.18.53.7:11434'
const LLM_MODEL = env.ORBIT_LLM_MODEL || 'qwen2.5:3b-instruct'
const EC2_URL = env.ORBIT_EC2_LLM_URL || ''
const ANTHROPIC_KEY = env.ANTHROPIC_API_KEY || ''
const ANTHROPIC_MODEL = env.ANTHROPIC_MODEL || 'claude-sonnet-5'
const LAMBDA_URL = env.ORBIT_LAMBDA_URL || ''

async function ollamaModels(baseUrl) {
  try {
    const r = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) })
    const d = await r.json()
    return (d.models || []).map((m) => m.name)
  } catch { return [] }
}

// Liste pour le sélecteur du dashboard : { id, label, metrics, target, available }
export async function listProviders() {
  const out = []
  // Ollama local (un item par modèle installé) -> métriques INFRA sur LLM-TEST01
  for (const name of await ollamaModels(LLM_URL)) {
    out.push({ id: `ollama:${name}`, label: `Local · ${name}`, metrics: 'infra', target: 'llm', available: true })
  }
  // EC2 GPU (Ollama distant) -> métriques INFRA (agent à déployer sur l'EC2)
  if (EC2_URL) {
    const models = await ollamaModels(EC2_URL)
    if (models.length) models.forEach((name) => out.push({ id: `ec2:${name}`, label: `EC2 GPU · ${name}`, metrics: 'infra', target: 'ec2', available: true }))
    else out.push({ id: 'ec2', label: 'AWS EC2 GPU (unreachable)', metrics: 'infra', target: 'ec2', available: false })
  } else {
    out.push({ id: 'ec2', label: 'AWS EC2 GPU (URL not configured)', metrics: 'infra', target: 'ec2', available: false })
  }
  // Claude -> métriques TOKENS
  out.push({ id: 'claude', label: ANTHROPIC_KEY ? `Claude · ${ANTHROPIC_MODEL}` : 'Claude (missing API key)', metrics: 'tokens', target: 'api', available: !!ANTHROPIC_KEY })
  // Lambda -> métriques TOKENS
  out.push({ id: 'lambda', label: LAMBDA_URL ? 'AWS Lambda' : 'AWS Lambda (URL not configured)', metrics: 'tokens', target: 'api', available: !!LAMBDA_URL })
  return out
}

export async function dispatch(providerId, ctx) {
  const id = providerId || ''
  if (id.startsWith('ollama:')) return ollama.run({ ...ctx, baseUrl: LLM_URL, model: id.slice(7) })
  if (id.startsWith('ec2:'))    return ollama.run({ ...ctx, baseUrl: EC2_URL, model: id.slice(4) })
  if (id === 'claude')          return claude.run({ ...ctx, apiKey: ANTHROPIC_KEY, model: ANTHROPIC_MODEL })
  if (id === 'lambda')          return lambda.run({ ...ctx, url: LAMBDA_URL })
  // défaut : Ollama local, modèle par défaut
  return ollama.run({ ...ctx, baseUrl: LLM_URL, model: LLM_MODEL })
}
