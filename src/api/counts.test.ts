import { beforeEach, describe, expect, it, vi } from 'vitest'
import { get } from '../lib/http'
import { getCounts } from './counts'

vi.mock('../lib/http', () => ({ get: vi.fn() }))
const mockGet = vi.mocked(get)

beforeEach(() => mockGet.mockReset())

describe('getCounts', () => {
  it('hits /bugs/counts with no params when only resource is given', async () => {
    mockGet.mockResolvedValueOnce({ total: 42 })
    const resp = await getCounts('bugs')
    expect(mockGet).toHaveBeenCalledWith('/bugs/counts', undefined)
    expect(resp).toEqual({ total: 42 })
  })

  it('appends status / severity filters to the bugs/counts URL', async () => {
    mockGet.mockResolvedValueOnce({ total: 240 })
    await getCounts('bugs', { status: 'open', severity: 'medium' })
    const url = mockGet.mock.calls[0]?.[0] as string
    expect(url).toContain('/bugs/counts')
    expect(url).toContain('status=open')
    expect(url).toContain('severity=medium')
  })

  it('appends group_by when present', async () => {
    mockGet.mockResolvedValueOnce({
      total: 6,
      group_by: 'status',
      buckets: { open: 2, fixed: 4 },
    })
    await getCounts('bugs', { groupBy: 'status' })
    const url = mockGet.mock.calls[0]?.[0] as string
    expect(url).toContain('group_by=status')
  })

  it('threads chain_slug + chain_status for tasks/counts', async () => {
    mockGet.mockResolvedValueOnce({ total: 12 })
    await getCounts('tasks', { chain_slug: 'my-chain', chain_status: 'open' })
    const url = mockGet.mock.calls[0]?.[0] as string
    expect(url).toContain('/tasks/counts')
    expect(url).toContain('chain_slug=my-chain')
    expect(url).toContain('chain_status=open')
  })

  it('passes priority for suggestions/counts', async () => {
    mockGet.mockResolvedValueOnce({ total: 3 })
    await getCounts('suggestions', { priority: 'high' })
    const url = mockGet.mock.calls[0]?.[0] as string
    expect(url).toContain('/suggestions/counts')
    expect(url).toContain('priority=high')
  })

  it('appends project= via withProjectQuery', async () => {
    mockGet.mockResolvedValueOnce({ total: 1 })
    await getCounts('chains', { project: 'mcp-servers' })
    const url = mockGet.mock.calls[0]?.[0] as string
    expect(url).toContain('/chains/counts')
    expect(url).toContain('project=mcp-servers')
  })

  it('passes the AbortSignal to the http layer', async () => {
    const ctrl = new AbortController()
    mockGet.mockResolvedValueOnce({ total: 0 })
    await getCounts('bugs', { signal: ctrl.signal })
    expect(mockGet.mock.calls[0]?.[1]).toBe(ctrl.signal)
  })
})
