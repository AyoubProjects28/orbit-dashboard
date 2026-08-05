import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LogsTab from './LogsTab'

const SESSIONS = [
  {
    session_id: 's_1',
    session_name: 'bench qwen 3b',
    turns: [
      {
        id: 't_1',
        ts: '2026-07-23T14:02:00.000Z',
        provider: 'ollama:qwen2.5:3b',
        prompt: 'combien de fichiers dans le répertoire ?',
        reply: 'Il y a 7 fichier(s) dans le répertoire.',
        route: 'llm-full',
        tools_called: ['list_documents'],
        metrics: {
          prompt_tokens: 120, completion_tokens: 40, total_tokens: 160,
          latency_ms: 2400, cost_usd: 0.0008,
        },
        sampling: {
          window_s: 12.4,
          vms: { llm: { cpu_avg: 78.2, cpu_base: 8.1, cpu_seconds: 12.4 } },
        },
      },
    ],
  },
]

function mockFetch(sessions) {
  globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ sessions }) }))
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('LogsTab', () => {
  it("affiche l'état vide quand aucun tour n'est journalisé", async () => {
    mockFetch([])
    render(<LogsTab />)
    await waitFor(() => expect(screen.getByText(/No prompts logged yet/)).toBeInTheDocument())
  })

  it('résume une session repliée puis déplie un tour au clic', async () => {
    mockFetch(SESSIONS)
    render(<LogsTab />)

    await waitFor(() => expect(screen.getByText('bench qwen 3b')).toBeInTheDocument())
    expect(screen.getByText(/1 prompt/)).toBeInTheDocument()
    expect(screen.getByText(/160 tok/)).toBeInTheDocument()
    expect(screen.queryByText(/combien de fichiers/)).not.toBeInTheDocument()

    await userEvent.click(screen.getByText('bench qwen 3b'))
    expect(screen.getByText(/combien de fichiers/)).toBeInTheDocument()
    expect(screen.getByText('llm-full')).toBeInTheDocument()

    await userEvent.click(screen.getByText(/combien de fichiers/))
    expect(screen.getByText('Il y a 7 fichier(s) dans le répertoire.')).toBeInTheDocument()
  })
})
