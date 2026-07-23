import { describe, expect, test } from 'vitest'
import {
  matchesSuggestionSearch,
  splitSurface,
  type SuggestionListRow,
  type SuggestionResolutionMix,
} from './suggestionIndex'

const suggestion = (
  overrides: Partial<SuggestionListRow> = {},
): SuggestionListRow => ({
  slug: 'add-fts5-on-roadmap',
  title: 'roadmap_list lacks FTS5 coverage',
  status: 'open',
  surface: 'roadmap,fts5',
  priority: 'medium',
  routed_chain_slug: '',
  routed_task_slug: '',
  routed_bug_slug: '',
  resolved_commit_sha: null,
  filed_at: '2026-05-21T00:00:00Z',
  resolved_at: null,
  project_id: 'mcp-servers',
  ...overrides,
})

describe('splitSurface (re-exported)', () => {
  test('comma-separated tags split correctly', () => {
    expect(splitSurface('arcreview,dispatch')).toEqual(['arcreview', 'dispatch'])
  })

  test('empty string returns empty array', () => {
    expect(splitSurface('')).toEqual([])
  })
})

describe('SuggestionResolutionMix', () => {
  test('shape carries counts for all four suggestion-side buckets', () => {
    const mix: SuggestionResolutionMix = {
      open: 5,
      adopted: 3,
      deferred: 2,
      rejected: 1,
    }
    expect(mix.open + mix.adopted + mix.deferred + mix.rejected).toBe(11)
  })

  test('type has exactly the four canonical status kind keys', () => {
    const mix: SuggestionResolutionMix = { open: 0, adopted: 0, deferred: 0, rejected: 0 }
    expect(Object.keys(mix).sort()).toEqual(['adopted', 'deferred', 'open', 'rejected'])
  })
})

describe('matchesSuggestionSearch', () => {
  test('empty query matches everything', () => {
    expect(matchesSuggestionSearch(suggestion(), '')).toBe(true)
    expect(matchesSuggestionSearch(suggestion(), '   ')).toBe(true)
  })

  test('matches on slug, title, or surface substring — case-insensitive', () => {
    expect(matchesSuggestionSearch(suggestion(), 'FTS5')).toBe(true)
    expect(matchesSuggestionSearch(suggestion(), 'roadmap')).toBe(true)
    expect(matchesSuggestionSearch(suggestion(), 'add-fts5')).toBe(true)
  })

  test('returns false when query matches none of the three fields', () => {
    expect(matchesSuggestionSearch(suggestion(), 'zzznomatch')).toBe(false)
  })
})

describe('SuggestionListRow has the routed_bug_slug field', () => {
  test('routed_bug_slug is part of the row shape (bidirectional routing)', () => {
    const s = suggestion({ routed_bug_slug: 'sug-followup' })
    expect(s.routed_bug_slug).toBe('sug-followup')
  })
})
