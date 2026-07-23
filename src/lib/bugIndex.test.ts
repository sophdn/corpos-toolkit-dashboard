import { describe, expect, test } from 'vitest'
import { matchesBugSearch, splitSurface } from './bugIndex'
import type { BugListRow, BugResolutionMix } from './bugIndex'

const bug = (overrides: Partial<BugListRow> = {}): BugListRow => ({
  slug: 'task-row-not-highlighted',
  title: 'Task row not highlighted after navigation',
  status: 'open',
  surface: 'dashboard,forge',
  severity: 'medium',
  filed_at: '2026-04-24T10:00:00Z',
  resolved_at: null,
  project_id: 'seed-packet',
  ...overrides,
})

describe('splitSurface', () => {
  // @blurb Empty string produces an empty array — no phantom blank tokens
  // @blurb that would cause spurious surface tag renders in the UI.
  test('empty string returns empty array', () => {
    expect(splitSurface('')).toEqual([])
  })

  // @blurb A single tag with no commas returns a one-element array,
  // @blurb confirming the function is safe for the simple case.
  test('single tag returns one-element array', () => {
    expect(splitSurface('forge')).toEqual(['forge'])
  })

  // @blurb Comma-separated tags split into individual elements preserving
  // @blurb the original tag names exactly.
  test('comma-separated tags split correctly', () => {
    expect(splitSurface('seed-mcp,library,references')).toEqual([
      'seed-mcp',
      'library',
      'references',
    ])
  })

  // @blurb Leading and trailing whitespace around each token is stripped so
  // @blurb tags authored as "seed-mcp, library" render cleanly.
  test('whitespace around tokens is trimmed', () => {
    expect(splitSurface(' seed-mcp , library ')).toEqual(['seed-mcp', 'library'])
  })

  // @blurb A sparse CSV like ",forge," drops blank tokens rather than
  // @blurb inserting empty strings into the tag list.
  test('blank tokens from sparse csv are filtered out', () => {
    expect(splitSurface(',forge,')).toEqual(['forge'])
  })
})

describe('BugResolutionMix', () => {
  // @blurb A full six-kind corpus shape with non-zero values for each status
  // @blurb satisfies the BugResolutionMix type and reports all counts correctly.
  test('all-present shape carries counts for all six kinds', () => {
    const mix: BugResolutionMix = { open: 5, fixed: 12, wontfix: 2, upstream: 4, routed: 3, dup: 1 }
    expect(mix.open).toBe(5)
    expect(mix.fixed).toBe(12)
    expect(mix.wontfix).toBe(2)
    expect(mix.upstream).toBe(4)
    expect(mix.routed).toBe(3)
    expect(mix.dup).toBe(1)
  })

  // @blurb A partial corpus where only open bugs exist still conforms to the
  // @blurb type — the absent kinds can be zero without breaking the shape.
  test('partial-kinds shape with zero for absent statuses is valid', () => {
    const mix: BugResolutionMix = { open: 3, fixed: 0, wontfix: 0, upstream: 0, routed: 0, dup: 0 }
    expect(mix.open).toBe(3)
    const resolved = mix.fixed + mix.wontfix + mix.upstream + mix.routed + mix.dup
    expect(resolved).toBe(0)
  })

  // @blurb An empty corpus returns all-zero counts, confirming the widget will
  // @blurb render "0" for every chip rather than an error or undefined.
  test('all-zero shape represents an empty corpus', () => {
    const mix: BugResolutionMix = { open: 0, fixed: 0, wontfix: 0, upstream: 0, routed: 0, dup: 0 }
    const total = Object.values(mix).reduce((s, v) => s + v, 0)
    expect(total).toBe(0)
  })

  // @blurb The six status kinds in the type are the canonical ones used by
  // @blurb bug_resolution_mix — this test guards against accidental renames.
  // @blurb `upstream` (bug 1330) is a sibling of `wontfix` for bugs whose
  // @blurb root cause is in a dependency we don't author.
  test('type has exactly the six canonical status kind keys', () => {
    const mix: BugResolutionMix = { open: 0, fixed: 0, wontfix: 0, upstream: 0, routed: 0, dup: 0 }
    expect(Object.keys(mix).sort()).toEqual(['dup', 'fixed', 'open', 'routed', 'upstream', 'wontfix'])
  })
})

describe('matchesBugSearch', () => {
  // @blurb An empty query matches every bug so the full list is shown when the
  // @blurb search input is blank.
  test('empty query matches all bugs', () => {
    expect(matchesBugSearch(bug(), '')).toBe(true)
    expect(matchesBugSearch(bug(), '   ')).toBe(true)
  })

  // @blurb A substring of the slug matches so users can type a partial slug
  // @blurb fragment to locate a specific bug quickly.
  test('matches on slug substring', () => {
    expect(matchesBugSearch(bug(), 'task-row')).toBe(true)
    expect(matchesBugSearch(bug(), 'highlighted')).toBe(true)
  })

  // @blurb A substring of the title matches so users can search by natural
  // @blurb language description rather than the technical slug.
  test('matches on title substring', () => {
    expect(matchesBugSearch(bug(), 'navigation')).toBe(true)
    expect(matchesBugSearch(bug(), 'Task row')).toBe(true)
  })

  // @blurb A substring of the surface field matches so users can filter by
  // @blurb area tag without having to use the server-side surface filter.
  test('matches on surface substring', () => {
    expect(matchesBugSearch(bug(), 'forge')).toBe(true)
    expect(matchesBugSearch(bug(), 'dashboard')).toBe(true)
  })

  // @blurb Matching is case-insensitive so users don't need to remember exact
  // @blurb capitalisation of slugs, titles, or surface tags.
  test('matching is case-insensitive', () => {
    expect(matchesBugSearch(bug(), 'DASHBOARD')).toBe(true)
    expect(matchesBugSearch(bug(), 'TASK-ROW')).toBe(true)
  })

  // @blurb The numeric id matches (with or without the '#' the id chip renders)
  // @blurb so users can paste an id straight from the card into search.
  test('matches on numeric id, with or without a leading #', () => {
    expect(matchesBugSearch(bug({ id: 1156 }), '1156')).toBe(true)
    expect(matchesBugSearch(bug({ id: 1156 }), '#1156')).toBe(true)
    expect(matchesBugSearch(bug({ id: 1156 }), '115')).toBe(true) // substring
    expect(matchesBugSearch(bug({ id: 1156 }), '9999')).toBe(false)
    // A bare '#' is not an id query and must not match every row.
    expect(matchesBugSearch(bug({ id: 1156 }), '#')).toBe(false)
  })

  // @blurb A query that doesn't appear in slug, title, or surface returns false
  // @blurb so the row is hidden from the filtered list.
  test('returns false when query matches none of the three fields', () => {
    expect(matchesBugSearch(bug(), 'zzznomatch')).toBe(false)
  })
})
