import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FamiliesTab from './FamiliesTab'

// The family name also appears as an <option> in the inbox's "assign to"
// select, so plain screen.getByText() is ambiguous — scope to the card list.
function familyList() {
  return within(document.querySelector('.families-list'))
}

function turn(overrides = {}) {
  return {
    id: 't1',
    ts: '2026-08-06T10:00:00.000Z',
    session_id: 's1',
    provider: 'ollama:qwen2.5:7b',
    prompt: 'How many files are there?',
    reply: '7 files.',
    prompt_key: 'sha1:a',
    condition: 'authorized',
    inferred: false,
    used_mcp_tool: true,
    metrics: { cost_usd: 0.001, latency_ms: 1000, total_tokens: 500 },
    calls: null,
    ...overrides,
  }
}

function basePayload(overrides = {}) {
  return {
    families: [],
    assignments: [],
    grades: [],
    expectations: [],
    turns: [],
    skipped: 0,
    ...overrides,
  }
}

// Minimal router over the real /api/families surface, method + URL keyed —
// FamiliesTab drives create/delete/assign through it, same as the live
// backend, just in-memory.
function mockFetch(initialPayload) {
  let payload = initialPayload
  globalThis.fetch = vi.fn(async (url, options = {}) => {
    const method = options.method ?? 'GET'
    const path = String(url)
    if (path === '/api/families' && method === 'GET') {
      return { ok: true, json: async () => payload }
    }
    if (path === '/api/families' && method === 'POST') {
      const body = JSON.parse(options.body)
      const id = body.id ?? `fam_new`
      payload = {
        ...payload,
        families: [...payload.families.filter((f) => f.id !== id), { id, name: body.name, description: body.description, deleted: false }],
      }
      return { ok: true, json: async () => ({ id }) }
    }
    if (/^\/api\/families\/[^/]+\/assign$/.test(path) && method === 'POST') {
      const familyId = path.split('/')[3]
      const body = JSON.parse(options.body)
      payload = {
        ...payload,
        assignments: [
          ...payload.assignments.filter((a) => !body.turn_ids.includes(a.turn_id)),
          ...body.turn_ids.map((turnId) => ({ turn_id: turnId, family_id: familyId })),
        ],
      }
      return { ok: true, json: async () => ({}) }
    }
    return { ok: true, json: async () => ({}) }
  })
  return () => payload
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('FamiliesTab', () => {
  it('shows an empty-inbox / no-families state when nothing is logged yet', async () => {
    mockFetch(basePayload())
    render(<FamiliesTab />)
    await waitFor(() => expect(screen.getByText(/No families yet/)).toBeInTheDocument())
    expect(screen.getByText(/Nothing waiting/)).toBeInTheDocument()
  })

  it('lists unassigned turns in the inbox and assigned turns under their family', async () => {
    mockFetch(basePayload({
      families: [{ id: 'fam_a', name: 'Doc questions', description: 'd', deleted: false, ts: 't' }],
      turns: [turn({ id: 't1', prompt: 'How many files?' }), turn({ id: 't2', prompt: 'Say hello' })],
      assignments: [{ turn_id: 't1', family_id: 'fam_a' }],
    }))
    render(<FamiliesTab />)
    await waitFor(() => expect(familyList().getByText('Doc questions')).toBeInTheDocument())
    // t2 is unassigned -> shows in the inbox
    expect(screen.getByText('Say hello')).toBeInTheDocument()
    // t1 is assigned -> not in the inbox list
    expect(screen.queryByText('How many files?')).not.toBeInTheDocument()
  })

  it('filters the family list by name via the search box', async () => {
    mockFetch(basePayload({
      families: [
        { id: 'fam_a', name: 'Document inventory', description: 'd', deleted: false, ts: 't' },
        { id: 'fam_b', name: 'Search chains', description: 'd', deleted: false, ts: 't' },
      ],
    }))
    render(<FamiliesTab />)
    await waitFor(() => expect(familyList().getByText('Document inventory')).toBeInTheDocument())
    expect(familyList().getByText('Search chains')).toBeInTheDocument()

    await userEvent.type(screen.getByPlaceholderText(/Search a family/), 'search')
    expect(familyList().getByText('Search chains')).toBeInTheDocument()
    expect(familyList().queryByText('Document inventory')).not.toBeInTheDocument()
  })

  it('keeps at least one condition chip active — clicking the last one is a no-op', async () => {
    mockFetch(basePayload())
    render(<FamiliesTab />)
    await waitFor(() => expect(screen.getByText('No MCP')).toBeInTheDocument())

    await userEvent.click(screen.getByText('No MCP'))
    await userEvent.click(screen.getByText('MCP allowed'))
    // Now only "MCP forced" is left on — clicking it must not turn everything off.
    await userEvent.click(screen.getByText('MCP forced'))
    expect(screen.getByText('MCP forced').className).toContain('on')
  })

  it('shows the malformed-line warning when the backend reports skipped lines (acceptance criterion 7)', async () => {
    mockFetch(basePayload({ skipped: 3 }))
    render(<FamiliesTab />)
    await waitFor(() => expect(screen.getByText(/3 lines skipped in families\.jsonl/)).toBeInTheDocument())
  })

  it('creating a family through the modal posts it and shows it in the list', async () => {
    mockFetch(basePayload())
    render(<FamiliesTab />)
    await waitFor(() => expect(screen.getByText(/No families yet/)).toBeInTheDocument())

    await userEvent.click(screen.getByText('+ New family'))
    await userEvent.type(screen.getByLabelText('Name'), 'Document inventory')
    await userEvent.type(screen.getByLabelText('Description *'), 'Questions about the document base.')
    await userEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => expect(familyList().getByText('Document inventory')).toBeInTheDocument())
  })

  it('assigning a selected inbox turn moves it out of Unassigned', async () => {
    mockFetch(basePayload({
      families: [{ id: 'fam_a', name: 'Doc questions', description: 'd', deleted: false, ts: 't' }],
      turns: [turn({ id: 't1', prompt: 'How many files?' })],
    }))
    render(<FamiliesTab />)
    await waitFor(() => expect(screen.getByText('How many files?')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.selectOptions(screen.getByLabelText('Target family'), 'fam_a')
    await userEvent.click(screen.getByRole('button', { name: /Add 1 to family/ }))

    await waitFor(() => expect(screen.queryByText('How many files?')).not.toBeInTheDocument())
  })
})
