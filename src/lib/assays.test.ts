import { describe, expect, it } from 'vitest'
import {
  abbreviateVerdict,
  matchesAssaySearch,
  pivotScores,
  runStatusToSemantic,
  verdictToSemantic,
  type AssayRunRow,
  type AssayScore,
} from './assays'

const sampleRow: AssayRunRow = {
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

function score(partial: Partial<AssayScore>): AssayScore {
  return {
    condition: 'baseline',
    run: 1,
    verdict_kind: 'pass',
    verdict_reason: '',
    item: 'casg-direct',
    rationale: '',
    ...partial,
  }
}

describe('runStatusToSemantic', () => {
  it('maps completed → positive and failed → negative', () => {
    expect(runStatusToSemantic('completed')).toBe('positive')
    expect(runStatusToSemantic('failed')).toBe('negative')
  })

  it('maps unknown status → neutral', () => {
    expect(runStatusToSemantic('running')).toBe('neutral')
    expect(runStatusToSemantic('')).toBe('neutral')
  })
})

describe('verdictToSemantic', () => {
  it('maps pass and pass_with_condition → positive', () => {
    expect(verdictToSemantic('pass')).toBe('positive')
    expect(verdictToSemantic('pass_with_condition')).toBe('positive')
  })

  it('maps fail → negative', () => {
    expect(verdictToSemantic('fail')).toBe('negative')
  })

  it('maps flag / deferred / not_applicable → neutral', () => {
    expect(verdictToSemantic('flag')).toBe('neutral')
    expect(verdictToSemantic('deferred')).toBe('neutral')
    expect(verdictToSemantic('not_applicable')).toBe('neutral')
  })
})

describe('abbreviateVerdict', () => {
  it('abbreviates the known verdict kinds', () => {
    expect(abbreviateVerdict('pass')).toBe('PASS')
    expect(abbreviateVerdict('pass_with_condition')).toBe('PASS+')
    expect(abbreviateVerdict('flag')).toBe('FLAG')
    expect(abbreviateVerdict('deferred')).toBe('DEFER')
    expect(abbreviateVerdict('fail')).toBe('FAIL')
    expect(abbreviateVerdict('not_applicable')).toBe('N/A')
  })

  it('falls back to a truncated uppercase for unknown kinds', () => {
    expect(abbreviateVerdict('mystery')).toBe('MYSTE')
    expect(abbreviateVerdict('')).toBe('—')
  })
})

describe('pivotScores', () => {
  it('pivots conditions (first-seen order) × runs (ascending)', () => {
    const grid = pivotScores([
      score({ condition: 'baseline', run: 1, verdict_kind: 'fail' }),
      score({ condition: 'grounded_glyph', run: 1, verdict_kind: 'pass' }),
      score({ condition: 'baseline', run: 2, verdict_kind: 'pass' }),
      score({ condition: 'grounded_glyph', run: 2, verdict_kind: 'pass' }),
    ])
    expect(grid.conditions).toEqual(['baseline', 'grounded_glyph'])
    expect(grid.runs).toEqual([1, 2])
    expect(grid.rows[0].condition).toBe('baseline')
    expect(grid.rows[0].cells[0]?.verdict_kind).toBe('fail')
    expect(grid.rows[0].cells[1]?.verdict_kind).toBe('pass')
  })

  it('leaves null cells for missing (condition, run) pairs', () => {
    const grid = pivotScores([
      score({ condition: 'baseline', run: 1 }),
      score({ condition: 'baseline', run: 3 }),
    ])
    expect(grid.runs).toEqual([1, 3])
    expect(grid.rows[0].cells).toHaveLength(2)
    expect(grid.rows[0].cells[0]).not.toBeNull()
    expect(grid.rows[0].cells[1]?.run).toBe(3)
  })

  it('returns an empty grid for an empty score list', () => {
    const grid = pivotScores([])
    expect(grid.conditions).toEqual([])
    expect(grid.runs).toEqual([])
    expect(grid.rows).toEqual([])
  })
})

describe('matchesAssaySearch', () => {
  it('matches everything for an empty query', () => {
    expect(matchesAssaySearch(sampleRow, '')).toBe(true)
    expect(matchesAssaySearch(sampleRow, '   ')).toBe(true)
  })

  it('matches on run_id, name, assay, item_id, and model_id (case-insensitive)', () => {
    expect(matchesAssaySearch(sampleRow, 'SR-1')).toBe(true)
    expect(matchesAssaySearch(sampleRow, 'smoke')).toBe(true)
    expect(matchesAssaySearch(sampleRow, 'glyph')).toBe(true)
    expect(matchesAssaySearch(sampleRow, 'casg')).toBe(true)
    expect(matchesAssaySearch(sampleRow, 'qwen2.5')).toBe(true)
  })

  it('returns false when nothing matches', () => {
    expect(matchesAssaySearch(sampleRow, 'nonexistent')).toBe(false)
  })
})
