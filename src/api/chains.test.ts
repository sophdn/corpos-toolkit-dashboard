import { beforeEach, describe, expect, it, vi } from 'vitest'
import { get } from '../lib/http'
import { findChain, getChainState, listChains } from './chains'

vi.mock('../lib/http', () => ({ get: vi.fn() }))
const mockGet = vi.mocked(get)

beforeEach(() => mockGet.mockReset())

describe('listChains', () => {
  it('hits /chains and adapts ChainRow → ChainSummary', async () => {
    mockGet.mockResolvedValueOnce([
      {
        id: 1,
        project_id: 'seed-packet',
        slug: 'a',
        status: 'open',
        total_tasks: 5,
        pending: 1,
        active: 1,
        blocked: 0,
        closed: 3,
        cancelled: 0,
        updated_at: '2026-05-05T00:00:00Z',
      },
    ])
    const out = await listChains()
    expect(mockGet).toHaveBeenCalledWith('/chains', undefined)
    expect(out.chains).toHaveLength(1)
    expect(out.chains[0]).toMatchObject({
      id: 1,
      slug: 'a',
      tasks_total: 5,
      tasks_pending: 1,
      tasks_active: 1,
      tasks_closed: 3,
    })
  })

  it('appends ?project= when project is set', async () => {
    mockGet.mockResolvedValueOnce([])
    await listChains({ project: 'seed-packet' })
    expect(mockGet).toHaveBeenCalledWith('/chains?project=seed-packet', undefined)
  })

  it('appends include_closed=true', async () => {
    mockGet.mockResolvedValueOnce([])
    await listChains({ includeClosed: true })
    expect(mockGet.mock.calls[0]?.[0]).toContain('include_closed=true')
  })
})

describe('getChainState', () => {
  it('hits /tasks?chain_slug= and adapts to ChainStateResponse', async () => {
    // getChainState fans out two parallel reads: /tasks?chain_slug= and
    // /chains/{slug}. Both must be mocked or the .catch on the detail
    // promise dereferences undefined.
    mockGet.mockResolvedValueOnce([
      {
        id: 1,
        chain_id: 9,
        chain_slug: 'a',
        project_id: 'seed-packet',
        slug: 't1',
        position: 1,
        status: 'closed',
        problem_statement: 'do thing',
        updated_at: '',
      },
    ])
    // design_decisions retired from this projection-side cache in
    // migration 065 (Phase 4 F2); the field is absent from
    // ChainStateResponse + the observe-http JSON.
    mockGet.mockResolvedValueOnce({
      id: 9,
      project_id: 'seed-packet',
      slug: 'a',
      status: 'open',
      output: 'OUT',
      completion_condition: 'CC',
      closure_summary: '',
      created_at: '',
      updated_at: '',
    })
    const out = await getChainState('a')
    expect(mockGet.mock.calls[0]?.[0]).toContain('/tasks?chain_slug=a')
    expect(mockGet.mock.calls[1]?.[0]).toContain('/chains/a')
    expect(out.found).toBe(true)
    expect(out.tasks).toHaveLength(1)
    expect(out.tasks[0]).toMatchObject({ id: 1, slug: 't1', order: 1 })
    expect(out.output).toBe('OUT')
    expect(out.completion_condition).toBe('CC')
    expect(out.project_id).toBe('seed-packet')
  })

  it('falls back to the caller-supplied project when the detail endpoint 404s', async () => {
    mockGet.mockResolvedValueOnce([])
    mockGet.mockRejectedValueOnce(new Error('404 not found'))
    const out = await getChainState('a', { project: 'mcp-servers' })
    expect(out.project_id).toBe('mcp-servers')
  })

  it('emits project_id=null when both detail and caller-supplied project are absent', async () => {
    mockGet.mockResolvedValueOnce([])
    mockGet.mockRejectedValueOnce(new Error('404 not found'))
    const out = await getChainState('a')
    expect(out.project_id).toBeNull()
  })

  it('tolerates 404 on the detail endpoint and returns the tasks-only response', async () => {
    mockGet.mockResolvedValueOnce([
      {
        id: 1,
        chain_id: 9,
        chain_slug: 'a',
        project_id: 'seed-packet',
        slug: 't1',
        position: 1,
        status: 'closed',
        problem_statement: 'do thing',
        updated_at: '',
      },
    ])
    mockGet.mockRejectedValueOnce(new Error('404 not found'))
    const out = await getChainState('a')
    expect(out.found).toBe(true)
    expect(out.tasks).toHaveLength(1)
    expect(out.output).toBe('')
    expect(out.completion_condition).toBe('')
  })
})

describe('findChain', () => {
  it('runs client-side substring filter on the full chain list', async () => {
    mockGet.mockResolvedValueOnce([
      {
        id: 1,
        project_id: 'seed-packet',
        slug: 'unified-mcp-toolkit',
        status: 'open',
        total_tasks: 0,
        pending: 0,
        active: 0,
        blocked: 0,
        closed: 0,
        cancelled: 0,
        updated_at: '',
      },
      {
        id: 2,
        project_id: 'seed-packet',
        slug: 'something-else',
        status: 'closed',
        total_tasks: 0,
        pending: 0,
        active: 0,
        blocked: 0,
        closed: 0,
        cancelled: 0,
        updated_at: '',
      },
    ])
    const out = await findChain('toolkit')
    expect(out.found).toBe(true)
    expect(out.results).toHaveLength(1)
    expect(out.results[0]?.slug).toBe('unified-mcp-toolkit')
  })

  it('returns found=false for empty queries without fetching', async () => {
    mockGet.mockResolvedValueOnce([])
    const out = await findChain('   ')
    expect(out.found).toBe(false)
    expect(out.results).toEqual([])
  })

  it('matches a chain by numeric id, with or without a leading #', async () => {
    const chains = [
      {
        id: 331,
        project_id: 'seed-packet',
        slug: 'corpos-podman-deploy',
        status: 'open',
        total_tasks: 0, pending: 0, active: 0, blocked: 0, closed: 0, cancelled: 0,
        updated_at: '',
      },
      {
        id: 42,
        project_id: 'seed-packet',
        slug: 'something-else',
        status: 'open',
        total_tasks: 0, pending: 0, active: 0, blocked: 0, closed: 0, cancelled: 0,
        updated_at: '',
      },
    ]
    mockGet.mockResolvedValueOnce(chains)
    const byId = await findChain('331')
    expect(byId.results).toHaveLength(1)
    expect(byId.results[0]?.slug).toBe('corpos-podman-deploy')

    mockGet.mockResolvedValueOnce(chains)
    const byHashId = await findChain('#331')
    expect(byHashId.results).toHaveLength(1)
    expect(byHashId.results[0]?.slug).toBe('corpos-podman-deploy')
  })
})
