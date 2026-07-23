import { beforeEach, describe, expect, it, vi } from 'vitest'
import { get } from '../lib/http'
import { getAssayDetail, listAssays } from './assays'
import type { AssayRunDetailWire, AssayRunWire } from '../lib/assays'

vi.mock('../lib/http', () => ({ get: vi.fn() }))
const mockGet = vi.mocked(get)

beforeEach(() => mockGet.mockReset())

const sampleRow: AssayRunWire = {
  run_id: 'sr-1',
  name: 'casg-direct-v3-smoke',
  assay: 'grounded-glyph-probe',
  item_id: 'casg-direct',
  image_ref: 'localhost/lab-grounded-glyph-probe:dev',
  image_digest: 'sha256:4fe91f54ce7f',
  model_id: 'Qwen2.5-32B-Instruct-Q4_K_M.gguf',
  model_version: 'q4km',
  status: 'completed',
  error: '',
  run_at: '2026-07-09T00:33:10Z',
}

const sampleDetail: AssayRunDetailWire = {
  ...sampleRow,
  study_digest: 'abcdef',
  materials_hashes: { 'scenario.md': 'hash1', 'glyph.md': 'hash2' },
  responses_dir: '/abs/out/responses',
  scores: [
    {
      condition: 'baseline',
      run: 1,
      verdict_kind: 'fail',
      verdict_reason: 'no glyph',
      item: 'casg-direct',
      rationale: 'grounded-glyph-probe:baseline:response=2249chars',
    },
    {
      condition: 'grounded_glyph',
      run: 1,
      verdict_kind: 'pass',
      verdict_reason: '',
      item: 'casg-direct',
      rationale: '...',
    },
  ],
}

describe('listAssays', () => {
  it('hits /study-runs with no params when no filters set', async () => {
    mockGet.mockResolvedValueOnce([sampleRow])
    const out = await listAssays()
    expect(mockGet).toHaveBeenCalledWith('/study-runs', undefined)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ run_id: 'sr-1', assay: 'grounded-glyph-probe' })
  })

  it('passes assay / model_id / status / limit / project as query params', async () => {
    mockGet.mockResolvedValueOnce([])
    await listAssays({
      assay: 'grounded-glyph-probe',
      model_id: 'Qwen2.5-32B',
      status: 'completed',
      limit: 25,
      project: 'corpos-lab',
    })
    const url = mockGet.mock.calls[0]?.[0] as string
    expect(url).toContain('assay=grounded-glyph-probe')
    expect(url).toContain('model_id=Qwen2.5-32B')
    expect(url).toContain('status=completed')
    expect(url).toContain('limit=25')
    expect(url).toContain('project=corpos-lab')
  })

  it('adapts the bare wire array to view rows', async () => {
    mockGet.mockResolvedValueOnce([sampleRow])
    const out = await listAssays()
    expect(out[0].model_version).toBe('q4km')
    expect(out[0].image_digest).toBe('sha256:4fe91f54ce7f')
  })
})

describe('getAssayDetail', () => {
  it('fetches /study-runs/{run_id} and adapts provenance + scores', async () => {
    mockGet.mockResolvedValueOnce(sampleDetail)
    const detail = await getAssayDetail('sr-1')
    const url = mockGet.mock.calls[0]?.[0] as string
    expect(url).toBe('/study-runs/sr-1')
    expect(detail.study_digest).toBe('abcdef')
    expect(detail.materials_hashes).toEqual({ 'scenario.md': 'hash1', 'glyph.md': 'hash2' })
    expect(detail.responses_dir).toBe('/abs/out/responses')
    expect(detail.scores).toHaveLength(2)
    expect(detail.scores[0]).toMatchObject({ condition: 'baseline', verdict_kind: 'fail' })
  })

  it('threads the project query param', async () => {
    mockGet.mockResolvedValueOnce(sampleDetail)
    await getAssayDetail('sr-1', { project: 'corpos-lab' })
    const url = mockGet.mock.calls[0]?.[0] as string
    expect(url).toContain('/study-runs/sr-1')
    expect(url).toContain('project=corpos-lab')
  })

  it('defaults missing materials_hashes / scores to empty', async () => {
    const bare = { ...sampleDetail } as Partial<AssayRunDetailWire>
    delete bare.materials_hashes
    delete bare.scores
    mockGet.mockResolvedValueOnce(bare)
    const detail = await getAssayDetail('sr-1')
    expect(detail.materials_hashes).toEqual({})
    expect(detail.scores).toEqual([])
  })
})
