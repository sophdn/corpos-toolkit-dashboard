import { beforeEach, describe, expect, it, vi } from 'vitest'
import { get } from '../lib/http'
import { getMemorySubstrateStats } from './memorySubstrate'
import type { MemorySubstrateStats } from './types.gen'

vi.mock('../lib/http', () => ({ get: vi.fn() }))
const mockGet = vi.mocked(get)

beforeEach(() => mockGet.mockReset())

const sample: MemorySubstrateStats = {
  total_memories: 82,
  by_kind: [
    { key: 'feedback', count: 49 },
    { key: 'project', count: 18 },
  ],
  memory_written_total: 98,
  by_source: [
    { key: 'migration', count: 92 },
    { key: 'manual', count: 4 },
  ],
  event_rate: [
    { day: '2026-05-22', count: 93 },
    { day: '2026-05-24', count: 5 },
  ],
  parse_context_hits: 50,
  oldest_filed_at: '2026-05-22T18:34:54.571Z',
  newest_filed_at: '2026-05-24T23:38:25.840Z',
}

describe('getMemorySubstrateStats', () => {
  it('hits the memory-substrate endpoint with no params', async () => {
    mockGet.mockResolvedValueOnce(sample)
    const out = await getMemorySubstrateStats()
    expect(mockGet).toHaveBeenCalledWith('/knowledge/memory-substrate', undefined)
    expect(out.total_memories).toBe(82)
    expect(out.by_source[0]?.key).toBe('migration')
  })

  it('forwards the abort signal', async () => {
    mockGet.mockResolvedValueOnce(sample)
    const ctrl = new AbortController()
    await getMemorySubstrateStats(ctrl.signal)
    expect(mockGet).toHaveBeenCalledWith('/knowledge/memory-substrate', ctrl.signal)
  })
})
