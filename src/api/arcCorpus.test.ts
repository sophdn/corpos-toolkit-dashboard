import { beforeEach, describe, expect, it, vi } from 'vitest'
import { get } from '../lib/http'
import { getSnapshotCorpusStats } from './arcCorpus'
import type { ArcCorpusStatsResponse } from './types.gen'

vi.mock('../lib/http', () => ({ get: vi.fn() }))
const mockGet = vi.mocked(get)

beforeEach(() => mockGet.mockReset())

const sample: ArcCorpusStatsResponse = {
  total_rows: 281,
  distinct_sessions: 34,
  by_source: { live: 16, recovered: 265 },
  truncated_rows: 281,
  tuple_complete_rows: 259,
  message_count_buckets: [
    { label: '1-5', count: 11 },
    { label: '20', count: 211 },
  ],
  estimated_tokens_buckets: [{ label: '3000-3999', count: 159 }],
}

describe('getSnapshotCorpusStats', () => {
  it('hits the snapshot-corpus stats endpoint with no params', async () => {
    mockGet.mockResolvedValueOnce(sample)
    const out = await getSnapshotCorpusStats()
    expect(mockGet).toHaveBeenCalledWith('/telemetry/snapshot-corpus/stats', undefined)
    expect(out.total_rows).toBe(281)
    expect(out.by_source.live).toBe(16)
  })

  it('forwards the abort signal', async () => {
    mockGet.mockResolvedValueOnce(sample)
    const ctrl = new AbortController()
    await getSnapshotCorpusStats(ctrl.signal)
    expect(mockGet).toHaveBeenCalledWith(
      '/telemetry/snapshot-corpus/stats',
      ctrl.signal,
    )
  })
})
