import { beforeEach, describe, expect, it, vi } from 'vitest'
import { get } from '../lib/http'
import {
  getSuggestionResolutionMix,
  listSuggestions,
  readSuggestion,
} from './suggestions'
import type { SuggestionRow } from './types.gen'

vi.mock('../lib/http', () => ({ get: vi.fn() }))
const mockGet = vi.mocked(get)

beforeEach(() => mockGet.mockReset())

const sampleRow: SuggestionRow = {
  id: 1,
  project_id: 'mcp-servers',
  slug: 's1',
  title: 'cleanup proposal',
  surface: 'arcreview,dispatch',
  priority: 'medium',
  status: 'open',
  routed_chain_slug: '',
  routed_task_slug: '',
  routed_bug_slug: '',
  resolved_commit_sha: null,
  filed_at: '2026-05-21T00:00:00Z',
  resolved_at: null,
}

describe('listSuggestions', () => {
  it('hits /suggestions with no params when no filters set', async () => {
    mockGet.mockResolvedValueOnce([sampleRow])
    const out = await listSuggestions()
    expect(mockGet).toHaveBeenCalledWith('/suggestions', undefined)
    expect(out.suggestions).toHaveLength(1)
    expect(out.suggestions[0]).toMatchObject({ id: 1, slug: 's1', priority: 'medium' })
  })

  it('passes status / priority / project as query params', async () => {
    mockGet.mockResolvedValueOnce([])
    await listSuggestions({ status: 'open', priority: 'high', project: 'mcp-servers' })
    const url = mockGet.mock.calls[0]?.[0] as string
    expect(url).toContain('status=open')
    expect(url).toContain('priority=high')
    expect(url).toContain('project=mcp-servers')
  })

  it('carries routed_bug_slug through the adapter', async () => {
    mockGet.mockResolvedValueOnce([{ ...sampleRow, routed_bug_slug: 'sug-followup' }])
    const out = await listSuggestions()
    expect(out.suggestions[0]?.routed_bug_slug).toBe('sug-followup')
  })
})

describe('readSuggestion', () => {
  it('fetches the list and filters client-side by slug', async () => {
    mockGet.mockResolvedValueOnce([sampleRow])
    const detail = await readSuggestion('s1')
    expect(detail.slug).toBe('s1')
    expect(detail.priority).toBe('medium')
    expect(detail.routed_bug_slug).toBe('')
  })

  it('throws when the suggestion is missing from the list', async () => {
    mockGet.mockResolvedValueOnce([])
    await expect(readSuggestion('missing')).rejects.toThrow(/not found/)
  })
})

describe('getSuggestionResolutionMix', () => {
  it('reads from /suggestions/counts (grouped by status) — true counts independent of list cap', async () => {
    mockGet.mockResolvedValueOnce({
      total: 6,
      group_by: 'status',
      buckets: { open: 2, adopted: 1, deferred: 1, rejected: 2 },
    })
    const mix = await getSuggestionResolutionMix()
    const url = mockGet.mock.calls[0]?.[0] as string
    expect(url).toContain('/suggestions/counts')
    expect(url).toContain('group_by=status')
    expect(mix).toEqual({ open: 2, adopted: 1, deferred: 1, rejected: 2 })
  })

  it('defaults missing buckets to 0 (handles backend returning only populated keys)', async () => {
    mockGet.mockResolvedValueOnce({ total: 1, group_by: 'status', buckets: { open: 1 } })
    const mix = await getSuggestionResolutionMix()
    expect(mix).toEqual({ open: 1, adopted: 0, deferred: 0, rejected: 0 })
  })
})
