import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChatPanel from './ChatPanel'

const PROVIDERS = [
  { id: 'ollama:qwen2.5:3b', label: 'Local · qwen2.5:3b', metrics: 'infra', target: 'llm', available: true },
  { id: 'ollama:mistral:7b', label: 'Local · mistral:7b', metrics: 'infra', target: 'llm', available: true },
  { id: 'claude', label: 'Claude (clé API manquante)', metrics: 'tokens', target: 'api', available: false },
]

const TURN = {
  reply: 'Il y a 7 fichiers.',
  turnMetrics: {
    prompt_tokens: 120, completion_tokens: 40, total_tokens: 160,
    latency_ms: 2400, llm_latency_ms: 2100, overhead_ms: 300,
    load_ms: 100, prompt_eval_ms: 900, gen_ms: 1100,
    llm_calls: 2, cost_usd: 0.0008,
  },
}

function mockFetch() {
  globalThis.fetch = vi.fn(async (url) => {
    if (String(url).includes('/api/providers')) {
      return { ok: true, json: async () => ({ providers: PROVIDERS }) }
    }
    return { ok: true, json: async () => TURN }
  })
}

beforeEach(() => {
  mockFetch()
  window.localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

const noop = () => {}

describe('ChatPanel — sélecteur de cible', () => {
  it('remplit le sélecteur depuis /api/providers', async () => {
    render(<ChatPanel onMessageSent={noop} startSampling={noop} endSampling={noop} />)
    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument())
    expect(screen.getByRole('option', { name: 'Local · qwen2.5:3b' })).toBeInTheDocument()
  })

  it('désactive les cibles indisponibles', async () => {
    render(<ChatPanel onMessageSent={noop} startSampling={noop} endSampling={noop} />)
    await waitFor(() => expect(screen.getByRole('option', { name: /Claude/ })).toBeDisabled())
  })

  it('sélectionne la première cible disponible par défaut', async () => {
    render(<ChatPanel onMessageSent={noop} startSampling={noop} endSampling={noop} />)
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveValue('ollama:qwen2.5:3b'))
  })

  it('restaure la cible mémorisée dans localStorage', async () => {
    // Volontairement la DEUXIÈME cible disponible : si le composant retombait
    // bêtement sur la première, ce test le détecterait.
    window.localStorage.setItem('orbit_provider', 'ollama:mistral:7b')
    render(<ChatPanel onMessageSent={noop} startSampling={noop} endSampling={noop} />)
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveValue('ollama:mistral:7b'))
  })

  it('ignore une cible mémorisée devenue indisponible', async () => {
    window.localStorage.setItem('orbit_provider', 'claude')
    render(<ChatPanel onMessageSent={noop} startSampling={noop} endSampling={noop} />)
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveValue('ollama:qwen2.5:3b'))
  })
})

describe('ChatPanel — envoi', () => {
  it('encadre la requête par startSampling et endSampling', async () => {
    const startSampling = vi.fn()
    const endSampling = vi.fn()
    render(<ChatPanel onMessageSent={noop} startSampling={startSampling} endSampling={endSampling} />)
    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument())

    await userEvent.type(screen.getByRole('textbox'), 'combien de fichiers ?')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => expect(endSampling).toHaveBeenCalled())
    expect(startSampling).toHaveBeenCalledTimes(1)
  })

  it('envoie la cible choisie au backend', async () => {
    render(<ChatPanel onMessageSent={noop} startSampling={noop} endSampling={noop} />)
    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument())

    await userEvent.type(screen.getByRole('textbox'), 'salut')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => expect(screen.getByText('Il y a 7 fichiers.')).toBeInTheDocument())
    const chatCall = globalThis.fetch.mock.calls.find(([url]) => String(url).includes('/api/chat'))
    expect(JSON.parse(chatCall[1].body).provider).toBe('ollama:qwen2.5:3b')
  })

  it('appelle endSampling même quand la requête échoue', async () => {
    const endSampling = vi.fn()
    globalThis.fetch = vi.fn(async (url) => {
      if (String(url).includes('/api/providers')) {
        return { ok: true, json: async () => ({ providers: PROVIDERS }) }
      }
      throw new Error('backend down')
    })
    render(<ChatPanel onMessageSent={noop} startSampling={noop} endSampling={endSampling} />)
    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument())

    await userEvent.type(screen.getByRole('textbox'), 'salut')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => expect(endSampling).toHaveBeenCalled())
  })
})

describe('ChatPanel — métriques repliables', () => {
  it('replie les métriques par défaut et les déplie au clic', async () => {
    render(<ChatPanel onMessageSent={noop} startSampling={noop} endSampling={noop} />)
    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument())

    await userEvent.type(screen.getByRole('textbox'), 'salut')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(screen.getByText('Il y a 7 fichiers.')).toBeInTheDocument())

    expect(screen.queryByText(/Generation/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByText(/metrics/))
    expect(screen.getByText(/Generation/)).toBeInTheDocument()
    expect(screen.getByText(/160 tokens/)).toBeInTheDocument()
  })
})
