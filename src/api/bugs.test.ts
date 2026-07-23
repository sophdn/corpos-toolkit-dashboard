import { beforeEach, describe, expect, it, vi } from 'vitest'
import { get } from '../lib/http'
import { getBugResolutionMix, listBugs, readBug } from './bugs'

vi.mock('../lib/http', () => ({ get: vi.fn() }))
const mockGet = vi.mocked(get)

beforeEach(() => mockGet.mockReset())

import type { BugRow } from './types.gen'

const sampleRow: BugRow = {
  id: 1,
  project_id: 'seed-packet',
  slug: 'b1',
  title: 'broken thing',
  surface: 'work-server',
  severity: 'high',
  status: 'open',
  routed_suggestion_slug: '',
  filed_at: '2026-05-05T00:00:00Z',
  resolved_at: null,
  qwen_task_id: null,
}

describe('listBugs', () => {
  it('hits /bugs with no params when no filters set', async () => {
    mockGet.mockResolvedValueOnce([sampleRow])
    const out = await listBugs()
    expect(mockGet).toHaveBeenCalledWith('/bugs', undefined)
    expect(out.bugs).toHaveLength(1)
    expect(out.bugs[0]).toMatchObject({ id: 1, slug: 'b1', severity: 'high' })
  })

  it('passes status / severity / project as query params', async () => {
    mockGet.mockResolvedValueOnce([])
    await listBugs({ status: 'open', severity: 'high', project: 'seed-packet' })
    const url = mockGet.mock.calls[0]?.[0] as string
    expect(url).toContain('status=open')
    expect(url).toContain('severity=high')
    expect(url).toContain('project=seed-packet')
  })
})

describe('readBug', () => {
  it('fetches the list and filters client-side by slug', async () => {
    mockGet.mockResolvedValueOnce([sampleRow])
    const detail = await readBug('b1')
    expect(detail.slug).toBe('b1')
    expect(detail.title).toBe('broken thing')
  })

  it('throws when the bug is missing from the list', async () => {
    mockGet.mockResolvedValueOnce([])
    await expect(readBug('missing')).rejects.toThrow(/not found/)
  })
})

describe('getBugResolutionMix', () => {
  it('reads from /bugs/counts (grouped by status) — true counts independent of list cap', async () => {
    mockGet.mockResolvedValueOnce({
      total: 8,
      group_by: 'status',
      buckets: { open: 2, fixed: 1, wontfix: 1, upstream: 2, routed: 1, dup: 1 },
    })
    const mix = await getBugResolutionMix()
    const url = mockGet.mock.calls[0]?.[0] as string
    expect(url).toContain('/bugs/counts')
    expect(url).toContain('group_by=status')
    expect(mix).toEqual({ open: 2, fixed: 1, wontfix: 1, upstream: 2, routed: 1, dup: 1 })
  })

  it('defaults missing buckets to 0', async () => {
    mockGet.mockResolvedValueOnce({ total: 1, group_by: 'status', buckets: { open: 1 } })
    const mix = await getBugResolutionMix()
    expect(mix).toEqual({ open: 1, fixed: 0, wontfix: 0, upstream: 0, routed: 0, dup: 0 })
  })
})
