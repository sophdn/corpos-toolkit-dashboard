import { describe, expect, it } from 'vitest'
import {
  applyVisibleChains,
  chainFinishedCount,
  chainProgressBucket,
  chainSortCompare,
  chainStatusPredicate,
  computeChainHeaderStats,
  countByStatus,
  formatUpdatedAt,
  highlightSnippet,
  statusLabel,
  type ChainSummary,
  type ChainTask,
} from './chainIndex'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PENDING: ChainSummary = {
  slug: 'zeta-new-init',
  status: 'open',
  tasks_total: 3,
  tasks_pending: 3,
  tasks_closed: 0,
  tasks_cancelled: 0,
  updated_at: '2026-03-01T00:00:00Z',
}

const IN_PROGRESS: ChainSummary = {
  slug: 'alpha-midflight',
  status: 'open',
  tasks_total: 5,
  tasks_pending: 2,
  tasks_active: 1,
  tasks_closed: 2,
  tasks_cancelled: 0,
  updated_at: '2026-04-10T00:00:00Z',
}

// Mixed pending + blocked, no active. Models a chain whose only
// non-terminal tasks are waiting on dependency edges — no in-flight
// work, despite tasks_pending alone being less than total.
const PENDING_WITH_BLOCKED: ChainSummary = {
  slug: 'gamma-awaiting',
  status: 'open',
  tasks_total: 4,
  tasks_pending: 2,
  tasks_active: 0,
  tasks_blocked: 2,
  tasks_closed: 0,
  tasks_cancelled: 0,
  updated_at: '2026-04-12T00:00:00Z',
}

const CLOSED: ChainSummary = {
  slug: 'mu-shipped',
  status: 'closed',
  tasks_total: 4,
  tasks_pending: 0,
  tasks_closed: 4,
  tasks_cancelled: 0,
  updated_at: '2026-02-15T00:00:00Z',
}

const EMPTY: ChainSummary = {
  slug: 'empty-design-only',
  status: 'open',
  tasks_total: 0,
  tasks_pending: 0,
  tasks_closed: 0,
  tasks_cancelled: 0,
  updated_at: '2026-04-15T00:00:00Z',
}

// ---------------------------------------------------------------------------
// highlightSnippet
// ---------------------------------------------------------------------------

describe('highlightSnippet', () => {
  // @blurb Guards against empty strings matching everything — an empty pattern returns the full
  // @blurb snippet unchanged as one unhighlighted segment.
  it('returns a single plain segment when pattern is blank', () => {
    const segs = highlightSnippet('hello world', '')
    expect(segs).toEqual([{ text: 'hello world', highlighted: false }])
  })

  // @blurb Whitespace-only strings are treated as blank to avoid spurious highlighting of gaps
  // @blurb in text that contain nothing meaningful.
  it('returns a single plain segment when pattern is whitespace only', () => {
    const segs = highlightSnippet('hello world', '   ')
    expect(segs).toEqual([{ text: 'hello world', highlighted: false }])
  })

  // @blurb When the pattern is absent the full snippet is returned as one plain segment rather
  // @blurb than an empty array, so renderers always have at least one segment to display.
  it('returns a single plain segment when pattern is not found', () => {
    const segs = highlightSnippet('hello world', 'xyz')
    expect(segs).toEqual([{ text: 'hello world', highlighted: false }])
  })

  // @blurb A mid-string match produces [plain, highlighted, plain] — the UI needs this three-
  // @blurb segment structure to wrap the match in a <mark> element.
  it('wraps a match in the middle with three segments', () => {
    const segs = highlightSnippet('say hello world', 'hello')
    expect(segs).toEqual([
      { text: 'say ', highlighted: false },
      { text: 'hello', highlighted: true },
      { text: ' world', highlighted: false },
    ])
  })

  // @blurb A leading match produces [highlighted, plain], guarding the off-by-one where a
  // @blurb zero-index start would produce a spurious empty leading segment.
  it('wraps a match at the start with two segments', () => {
    const segs = highlightSnippet('hello world', 'hello')
    expect(segs).toEqual([
      { text: 'hello', highlighted: true },
      { text: ' world', highlighted: false },
    ])
  })

  // @blurb A trailing match produces [plain, highlighted] — guards against a spurious empty
  // @blurb trailing segment when the match ends at the last character.
  it('wraps a match at the end with two segments', () => {
    const segs = highlightSnippet('say hello', 'hello')
    expect(segs).toEqual([
      { text: 'say ', highlighted: false },
      { text: 'hello', highlighted: true },
    ])
  })

  // @blurb When the pattern equals the entire snippet, a single highlighted segment is returned
  // @blurb rather than surrounding it with empty segments.
  it('matches the full string in a single highlighted segment', () => {
    const segs = highlightSnippet('hello', 'hello')
    expect(segs).toEqual([{ text: 'hello', highlighted: true }])
  })

  // @blurb Matching must be case-insensitive so searching 'hello' finds 'HELLO'; the original
  // @blurb case of the snippet text is preserved in the highlighted segment.
  it('is case-insensitive: matches lowercase pattern against uppercase snippet', () => {
    const segs = highlightSnippet('Say HELLO World', 'hello')
    expect(segs).toHaveLength(3)
    expect(segs[1].highlighted).toBe(true)
    expect(segs[1].text).toBe('HELLO')
  })

  // @blurb Only the first occurrence is highlighted so the excerpt stays focused rather than
  // @blurb fragmenting the snippet into many small segments.
  it('only highlights the first occurrence', () => {
    const segs = highlightSnippet('foo foo foo', 'foo')
    const highlighted = segs.filter(s => s.highlighted)
    expect(highlighted).toHaveLength(1)
    expect(highlighted[0].text).toBe('foo')
  })
})

// ---------------------------------------------------------------------------
// chainFinishedCount
// ---------------------------------------------------------------------------

describe('chainFinishedCount', () => {
  // @blurb Finished work includes both properly closed tasks and cancelled ones — neither should
  // @blurb be invisible in the progress counter shown in chain list items.
  it('sums closed + cancelled', () => {
    const c: ChainSummary = { ...IN_PROGRESS, tasks_closed: 33, tasks_cancelled: 4 }
    expect(chainFinishedCount(c)).toBe(37)
  })

  // @blurb A chain with no finished tasks must report zero rather than undefined or NaN.
  it('returns 0 for pending chain', () => {
    expect(chainFinishedCount(PENDING)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// chainProgressBucket
// ---------------------------------------------------------------------------

describe('chainProgressBucket', () => {
  // @blurb A chain where no work has started belongs in the pending bucket, distinguishing it
  // @blurb from chains with any partial progress.
  it("returns 'pending' when every task is still pending", () => {
    expect(chainProgressBucket(PENDING)).toBe('pending')
  })

  // @blurb An empty chain has no progress to show — 'pending' is the correct default rather
  // @blurb than 'in-progress' or 'closed'.
  it("returns 'pending' when chain has no tasks", () => {
    expect(chainProgressBucket(EMPTY)).toBe('pending')
  })

  // @blurb At least one task in 'active' status is one signal of in-flight work — the chain is in
  // @blurb motion regardless of how the rest split between pending/blocked/closed.
  it("returns 'in-progress' when at least one task is in 'active' status", () => {
    expect(chainProgressBucket(IN_PROGRESS)).toBe('in-progress')
  })

  // @blurb Closed tasks are also a movement signal: even if no task is currently active, prior
  // @blurb completion proves the chain has been worked on. Sort it under in-progress so users see
  // @blurb their partially-done work above the truly untouched chains.
  it("returns 'in-progress' when tasks_closed > 0 even with no active task", () => {
    const closedNoActive: ChainSummary = {
      slug: 'paused-after-closed',
      status: 'open',
      tasks_total: 5,
      tasks_pending: 3,
      tasks_active: 0,
      tasks_blocked: 1,
      tasks_closed: 1,
      tasks_cancelled: 0,
      updated_at: '2026-04-11T00:00:00Z',
    }
    expect(chainProgressBucket(closedNoActive)).toBe('in-progress')
  })

  // @blurb Cancellation also counts as movement — someone made an explicit decision about the task,
  // @blurb so the chain is not untouched. Sort it as in-progress.
  it("returns 'in-progress' when tasks_cancelled > 0 even with no other movement", () => {
    const cancelledOnly: ChainSummary = {
      slug: 'partial-cancel',
      status: 'open',
      tasks_total: 4,
      tasks_pending: 3,
      tasks_active: 0,
      tasks_blocked: 0,
      tasks_closed: 0,
      tasks_cancelled: 1,
      updated_at: '2026-04-11T00:00:00Z',
    }
    expect(chainProgressBucket(cancelledOnly)).toBe('in-progress')
  })

  // @blurb A chain whose only non-terminal tasks are blocked-on-dependencies, with no closed work,
  // @blurb has no signal of movement — it sorts as pending. This is the discriminator between
  // @blurb 'parked-on-condition' and 'actively-being-worked'.
  it("returns 'pending' when tasks are pending+blocked with no closed/active work", () => {
    expect(chainProgressBucket(PENDING_WITH_BLOCKED)).toBe('pending')
  })

  // @blurb All-blocked is a degenerate case of the prior — every task waiting on dependencies, none
  // @blurb finished, none active. Still pending; still no movement.
  it("returns 'pending' when every task is blocked", () => {
    const allBlocked: ChainSummary = {
      ...PENDING_WITH_BLOCKED,
      tasks_pending: 0,
      tasks_blocked: 4,
    }
    expect(chainProgressBucket(allBlocked)).toBe('pending')
  })

  // @blurb Older server responses lack tasks_active/tasks_blocked. The finished count alone (from
  // @blurb tasks_closed + tasks_cancelled, both always present) is sufficient to detect movement,
  // @blurb so back-compat clients still classify correctly.
  it("treats missing tasks_active as 0 and uses finished count for movement", () => {
    const backCompatPending: ChainSummary = {
      slug: 'legacy-pending',
      status: 'open',
      tasks_total: 3,
      tasks_pending: 3,
      tasks_closed: 0,
      tasks_cancelled: 0,
      updated_at: '2026-04-11T00:00:00Z',
    }
    expect(chainProgressBucket(backCompatPending)).toBe('pending')

    const backCompatInProgress: ChainSummary = {
      ...backCompatPending,
      slug: 'legacy-partly-done',
      tasks_pending: 2,
      tasks_closed: 1,
    }
    expect(chainProgressBucket(backCompatInProgress)).toBe('in-progress')
  })

  // @blurb A chain whose status field is 'closed' is terminal regardless of task counts — the
  // @blurb status field takes precedence over task arithmetic.
  it("returns 'closed' when chain status is 'closed'", () => {
    expect(chainProgressBucket(CLOSED)).toBe('closed')
  })

  // @blurb Retired chains are terminal just like closed ones — both must collapse to the 'closed'
  // @blurb display bucket so they appear under the same filter.
  it("returns 'closed' when chain status is 'retired'", () => {
    expect(chainProgressBucket({ ...CLOSED, status: 'retired' })).toBe('closed')
  })

  // @blurb If all tasks are finished the chain is effectively done even when its status field
  // @blurb is still 'open' — task arithmetic can close a chain before the status field updates.
  it("returns 'closed' when closed + cancelled equal total on an open chain", () => {
    const allDone: ChainSummary = { ...IN_PROGRESS, status: 'open', tasks_total: 37, tasks_pending: 0, tasks_closed: 33, tasks_cancelled: 4 }
    expect(chainProgressBucket(allDone)).toBe('closed')
  })
})

// ---------------------------------------------------------------------------
// chainSortCompare
// ---------------------------------------------------------------------------

describe('chainSortCompare', () => {
  const chains = [IN_PROGRESS, CLOSED, PENDING, EMPTY]

  // @blurb Descending-updated sort surfaces the most recently active chains so users see
  // @blurb ongoing work at the top of the chain list by default.
  it("'updated-desc' puts most-recent first", () => {
    const sorted = [...chains].sort(chainSortCompare('updated-desc'))
    expect(sorted.map(c => c.slug)).toEqual([
      'empty-design-only', 'alpha-midflight', 'zeta-new-init', 'mu-shipped',
    ])
  })

  // @blurb Ascending-updated sort gives a chronological view, useful for finding chains that
  // @blurb haven't moved in a while.
  it("'updated-asc' puts oldest first", () => {
    const sorted = [...chains].sort(chainSortCompare('updated-asc'))
    expect(sorted.map(c => c.slug)).toEqual([
      'mu-shipped', 'zeta-new-init', 'alpha-midflight', 'empty-design-only',
    ])
  })

  // @blurb Alphabetical ascending sort provides a stable deterministic order for locating a
  // @blurb chain by name without knowing its recency.
  it("'slug-asc' sorts alphabetically", () => {
    const sorted = [...chains].sort(chainSortCompare('slug-asc'))
    expect(sorted.map(c => c.slug)).toEqual([
      'alpha-midflight', 'empty-design-only', 'mu-shipped', 'zeta-new-init',
    ])
  })

  // @blurb Reverse alphabetical sort complements slug-asc for scanning from the end of the
  // @blurb alphabet.
  it("'slug-desc' sorts reverse alphabetically", () => {
    const sorted = [...chains].sort(chainSortCompare('slug-desc'))
    expect(sorted.map(c => c.slug)).toEqual([
      'zeta-new-init', 'mu-shipped', 'empty-design-only', 'alpha-midflight',
    ])
  })
})

// ---------------------------------------------------------------------------
// chainStatusPredicate
// ---------------------------------------------------------------------------

describe('chainStatusPredicate', () => {
  // @blurb The 'all' filter must be a no-op (undefined predicate) rather than a function
  // @blurb returning true for everything, so the filter step is skipped entirely.
  it("'all' returns undefined (no filter)", () => {
    expect(chainStatusPredicate('all')).toBeUndefined()
  })

  // @blurb The in-progress predicate accepts chains with partial completion and rejects both
  // @blurb fully-pending and fully-closed chains.
  it("'in-progress' filters to only in-progress chains", () => {
    const pred = chainStatusPredicate('in-progress')!
    expect(pred(IN_PROGRESS)).toBe(true)
    expect(pred(PENDING)).toBe(false)
    expect(pred(CLOSED)).toBe(false)
  })

  // @blurb The pending predicate accepts both truly-pending chains and empty chains (no tasks
  // @blurb yet), since both represent unstarted work.
  it("'pending' filters to only pending chains", () => {
    const pred = chainStatusPredicate('pending')!
    expect(pred(PENDING)).toBe(true)
    expect(pred(EMPTY)).toBe(true)
    expect(pred(IN_PROGRESS)).toBe(false)
  })

  // @blurb The closed predicate accepts chains in terminal status (closed/retired) and rejects
  // @blurb all open chains.
  it("'closed' filters to only closed chains", () => {
    const pred = chainStatusPredicate('closed')!
    expect(pred(CLOSED)).toBe(true)
    expect(pred(IN_PROGRESS)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// statusLabel
// ---------------------------------------------------------------------------

describe('statusLabel', () => {
  // @blurb Machine status strings (e.g. 'in-progress') must map to user-facing labels
  // @blurb (e.g. 'In progress') for display in tables and detail panels.
  it('returns human-readable labels for known statuses', () => {
    expect(statusLabel('pending')).toBe('Pending')
    expect(statusLabel('active')).toBe('Active')
    expect(statusLabel('closed')).toBe('Closed')
    expect(statusLabel('cancelled')).toBe('Cancelled')
    expect(statusLabel('blocked')).toBe('Blocked')
  })

  // @blurb Unrecognised statuses fall back to their raw string to avoid silent data loss
  // @blurb when new statuses are introduced server-side.
  it('passes through unknown statuses unchanged', () => {
    expect(statusLabel('mystery')).toBe('mystery')
  })
})

// ---------------------------------------------------------------------------
// countByStatus
// ---------------------------------------------------------------------------

describe('countByStatus', () => {
  const tasks: ChainTask[] = [
    { order: 1, slug: 'a', status: 'closed', problem_statement: '' },
    { order: 2, slug: 'b', status: 'closed', problem_statement: '' },
    { order: 3, slug: 'c', status: 'active', problem_statement: '' },
    { order: 4, slug: 'd', status: 'pending', problem_statement: '' },
  ]

  // @blurb The aggregation must handle multiple tasks per status correctly; it populates
  // @blurb the count strip in the right panel detail view.
  it('counts correctly by status', () => {
    const counts = countByStatus(tasks)
    expect(counts['closed']).toBe(2)
    expect(counts['active']).toBe(1)
    expect(counts['pending']).toBe(1)
  })

  // @blurb An empty task list must produce an empty counts object rather than one pre-
  // @blurb populated with zero-valued keys that would confuse Object.entries callers.
  it('returns empty object for empty task list', () => {
    expect(countByStatus([])).toEqual({})
  })
})

// ---------------------------------------------------------------------------
// formatUpdatedAt
// ---------------------------------------------------------------------------

describe('formatUpdatedAt', () => {
  // @blurb The display format truncates the full ISO timestamp to a date-only string so
  // @blurb chain meta strips stay compact without losing day-level precision.
  it('slices ISO timestamp to YYYY-MM-DD', () => {
    expect(formatUpdatedAt('2026-04-25T01:00:00Z')).toBe('2026-04-25')
  })
})

// ---------------------------------------------------------------------------
// applyVisibleChains — exhaustive 4 sorts × 4 filters × search permutations
// ---------------------------------------------------------------------------

// Six fixture chains designed to cover all four progress buckets with
// deterministic sort order in both directions.
//
// Progress buckets (via chainProgressBucket):
//   in-progress: alpha-work, beta-work   (open, tasks_active > 0)
//   pending:     delta-new, gamma-new    (open, tasks_active === 0)
//   closed:      epsilon-done, zeta-done (status 'closed')
//
// updated_at ascending: epsilon(Mar28) < zeta(Mar30) < alpha(Apr1) < gamma(Apr2) < beta(Apr3) < delta(Apr4)
// slug ascending:       alpha < beta < delta < epsilon < gamma < zeta

const FIXTURE_CHAINS: ChainSummary[] = [
  { slug: 'alpha-work',    status: 'open',   tasks_total: 2, tasks_pending: 0, tasks_active: 1, tasks_closed: 1, tasks_cancelled: 0, updated_at: '2026-04-01T00:00:00Z' },
  { slug: 'beta-work',     status: 'open',   tasks_total: 2, tasks_pending: 0, tasks_active: 1, tasks_closed: 1, tasks_cancelled: 0, updated_at: '2026-04-03T00:00:00Z' },
  { slug: 'delta-new',     status: 'open',   tasks_total: 2, tasks_pending: 2, tasks_closed: 0, tasks_cancelled: 0, updated_at: '2026-04-04T00:00:00Z' },
  { slug: 'gamma-new',     status: 'open',   tasks_total: 2, tasks_pending: 2, tasks_closed: 0, tasks_cancelled: 0, updated_at: '2026-04-02T00:00:00Z' },
  { slug: 'epsilon-done',  status: 'closed', tasks_total: 4, tasks_pending: 0, tasks_closed: 4, tasks_cancelled: 0, updated_at: '2026-03-28T00:00:00Z' },
  { slug: 'zeta-done',     status: 'closed', tasks_total: 3, tasks_pending: 0, tasks_closed: 2, tasks_cancelled: 1, updated_at: '2026-03-30T00:00:00Z' },
]

// All slugs in the find set — narrowing has no effect, isolating filter+sort behaviour.
const ALL_SLUGS = new Set(FIXTURE_CHAINS.map(c => c.slug))

// Helper: slugs of result array.
function slugs(chains: ChainSummary[]): string[] {
  return chains.map(c => c.slug)
}

describe('applyVisibleChains — filter:all × 4 sorts (find active, all slugs match)', () => {
  // @blurb With no status filter applied all chains appear; this sort variant verifies the
  // @blurb ordering function produces the correct sequence on the full unfiltered set.
  it('all + slug-asc', () => {
    expect(slugs(applyVisibleChains(FIXTURE_CHAINS, 'all', 'slug-asc', ALL_SLUGS))).toEqual([
      'alpha-work', 'beta-work', 'delta-new', 'epsilon-done', 'gamma-new', 'zeta-done',
    ])
  })

  // @blurb With no status filter applied all chains appear; this sort variant verifies the
  // @blurb ordering function produces the correct sequence on the full unfiltered set.
  it('all + slug-desc', () => {
    expect(slugs(applyVisibleChains(FIXTURE_CHAINS, 'all', 'slug-desc', ALL_SLUGS))).toEqual([
      'zeta-done', 'gamma-new', 'epsilon-done', 'delta-new', 'beta-work', 'alpha-work',
    ])
  })

  // @blurb With no status filter applied all chains appear; this sort variant verifies the
  // @blurb ordering function produces the correct sequence on the full unfiltered set.
  it('all + updated-asc', () => {
    expect(slugs(applyVisibleChains(FIXTURE_CHAINS, 'all', 'updated-asc', ALL_SLUGS))).toEqual([
      'epsilon-done', 'zeta-done', 'alpha-work', 'gamma-new', 'beta-work', 'delta-new',
    ])
  })

  // @blurb With no status filter applied all chains appear; this sort variant verifies the
  // @blurb ordering function produces the correct sequence on the full unfiltered set.
  it('all + updated-desc', () => {
    expect(slugs(applyVisibleChains(FIXTURE_CHAINS, 'all', 'updated-desc', ALL_SLUGS))).toEqual([
      'delta-new', 'beta-work', 'gamma-new', 'alpha-work', 'zeta-done', 'epsilon-done',
    ])
  })
})

describe('applyVisibleChains — filter:in-progress × 4 sorts (find active, all slugs match)', () => {
  // @blurb Only in-progress chains (partial completion, open status) survive the filter;
  // @blurb this sort variant verifies ordering is applied correctly to the filtered subset.
  it('in-progress + slug-asc', () => {
    expect(slugs(applyVisibleChains(FIXTURE_CHAINS, 'in-progress', 'slug-asc', ALL_SLUGS))).toEqual([
      'alpha-work', 'beta-work',
    ])
  })

  // @blurb Only in-progress chains (partial completion, open status) survive the filter;
  // @blurb this sort variant verifies ordering is applied correctly to the filtered subset.
  it('in-progress + slug-desc', () => {
    expect(slugs(applyVisibleChains(FIXTURE_CHAINS, 'in-progress', 'slug-desc', ALL_SLUGS))).toEqual([
      'beta-work', 'alpha-work',
    ])
  })

  // @blurb Only in-progress chains (partial completion, open status) survive the filter;
  // @blurb this sort variant verifies ordering is applied correctly to the filtered subset.
  it('in-progress + updated-asc', () => {
    expect(slugs(applyVisibleChains(FIXTURE_CHAINS, 'in-progress', 'updated-asc', ALL_SLUGS))).toEqual([
      'alpha-work', 'beta-work',
    ])
  })

  // @blurb Only in-progress chains (partial completion, open status) survive the filter;
  // @blurb this sort variant verifies ordering is applied correctly to the filtered subset.
  it('in-progress + updated-desc', () => {
    expect(slugs(applyVisibleChains(FIXTURE_CHAINS, 'in-progress', 'updated-desc', ALL_SLUGS))).toEqual([
      'beta-work', 'alpha-work',
    ])
  })
})

describe('applyVisibleChains — filter:pending × 4 sorts (find active, all slugs match)', () => {
  // @blurb Only pending chains (no completed tasks) survive the filter; this sort variant
  // @blurb verifies ordering is applied correctly to the filtered subset.
  it('pending + slug-asc', () => {
    expect(slugs(applyVisibleChains(FIXTURE_CHAINS, 'pending', 'slug-asc', ALL_SLUGS))).toEqual([
      'delta-new', 'gamma-new',
    ])
  })

  // @blurb Only pending chains (no completed tasks) survive the filter; this sort variant
  // @blurb verifies ordering is applied correctly to the filtered subset.
  it('pending + slug-desc', () => {
    expect(slugs(applyVisibleChains(FIXTURE_CHAINS, 'pending', 'slug-desc', ALL_SLUGS))).toEqual([
      'gamma-new', 'delta-new',
    ])
  })

  // @blurb Only pending chains (no completed tasks) survive the filter; this sort variant
  // @blurb verifies ordering is applied correctly to the filtered subset.
  it('pending + updated-asc', () => {
    expect(slugs(applyVisibleChains(FIXTURE_CHAINS, 'pending', 'updated-asc', ALL_SLUGS))).toEqual([
      'gamma-new', 'delta-new',
    ])
  })

  // @blurb Only pending chains (no completed tasks) survive the filter; this sort variant
  // @blurb verifies ordering is applied correctly to the filtered subset.
  it('pending + updated-desc', () => {
    expect(slugs(applyVisibleChains(FIXTURE_CHAINS, 'pending', 'updated-desc', ALL_SLUGS))).toEqual([
      'delta-new', 'gamma-new',
    ])
  })
})

describe('applyVisibleChains — filter:closed × 4 sorts (find active, all slugs match)', () => {
  // @blurb Only closed/retired chains survive the filter; this sort variant verifies
  // @blurb ordering is applied correctly to the filtered subset.
  it('closed + slug-asc', () => {
    expect(slugs(applyVisibleChains(FIXTURE_CHAINS, 'closed', 'slug-asc', ALL_SLUGS))).toEqual([
      'epsilon-done', 'zeta-done',
    ])
  })

  // @blurb Only closed/retired chains survive the filter; this sort variant verifies
  // @blurb ordering is applied correctly to the filtered subset.
  it('closed + slug-desc', () => {
    expect(slugs(applyVisibleChains(FIXTURE_CHAINS, 'closed', 'slug-desc', ALL_SLUGS))).toEqual([
      'zeta-done', 'epsilon-done',
    ])
  })

  // @blurb Only closed/retired chains survive the filter; this sort variant verifies
  // @blurb ordering is applied correctly to the filtered subset.
  it('closed + updated-asc', () => {
    expect(slugs(applyVisibleChains(FIXTURE_CHAINS, 'closed', 'updated-asc', ALL_SLUGS))).toEqual([
      'epsilon-done', 'zeta-done',
    ])
  })

  // @blurb Only closed/retired chains survive the filter; this sort variant verifies
  // @blurb ordering is applied correctly to the filtered subset.
  it('closed + updated-desc', () => {
    expect(slugs(applyVisibleChains(FIXTURE_CHAINS, 'closed', 'updated-desc', ALL_SLUGS))).toEqual([
      'zeta-done', 'epsilon-done',
    ])
  })
})

describe('applyVisibleChains — find narrows within filter+sort (partial slug set)', () => {
  // Partial set: one chain per bucket — beta-work (in-progress), gamma-new (pending), zeta-done (closed)
  const PARTIAL = new Set(['beta-work', 'gamma-new', 'zeta-done'])

  // @blurb The find set intersection must preserve the sort order established before
  // @blurb narrowing — tests the most common combination of all-filter with slug-asc.
  it('all + slug-asc: only matching slugs survive, sort order preserved', () => {
    expect(slugs(applyVisibleChains(FIXTURE_CHAINS, 'all', 'slug-asc', PARTIAL))).toEqual([
      'beta-work', 'gamma-new', 'zeta-done',
    ])
  })

  // @blurb Narrowing must not disturb the sort order regardless of which sort direction
  // @blurb was applied before the find step.
  it('all + slug-desc: sort order preserved after narrowing', () => {
    expect(slugs(applyVisibleChains(FIXTURE_CHAINS, 'all', 'slug-desc', PARTIAL))).toEqual([
      'zeta-done', 'gamma-new', 'beta-work',
    ])
  })

  // @blurb Timestamp-based sort order must survive the find intersection step.
  it('all + updated-asc: sort order preserved after narrowing', () => {
    // updated-asc full order: epsilon, zeta, alpha, gamma, beta, delta
    // ∩ {beta, gamma, zeta} → zeta(Mar30), gamma(Apr2), beta(Apr3)
    expect(slugs(applyVisibleChains(FIXTURE_CHAINS, 'all', 'updated-asc', PARTIAL))).toEqual([
      'zeta-done', 'gamma-new', 'beta-work',
    ])
  })

  // @blurb Descending timestamp sort order must survive the find intersection step.
  it('all + updated-desc: sort order preserved after narrowing', () => {
    // updated-desc full order: delta, beta, gamma, alpha, zeta, epsilon
    // ∩ {beta, gamma, zeta} → beta(Apr3), gamma(Apr2), zeta(Mar30)
    expect(slugs(applyVisibleChains(FIXTURE_CHAINS, 'all', 'updated-desc', PARTIAL))).toEqual([
      'beta-work', 'gamma-new', 'zeta-done',
    ])
  })

  // @blurb Combined filter+find must produce the intersection of both constraints;
  // @blurb verifies that applying find on top of a filter yields only the overlap.
  it('in-progress + any sort: only beta-work survives', () => {
    expect(slugs(applyVisibleChains(FIXTURE_CHAINS, 'in-progress', 'slug-asc', PARTIAL))).toEqual(['beta-work'])
    expect(slugs(applyVisibleChains(FIXTURE_CHAINS, 'in-progress', 'updated-desc', PARTIAL))).toEqual(['beta-work'])
  })

  // @blurb Combined pending filter and find set leave only the chain that satisfies
  // @blurb both predicates.
  it('pending + any sort: only gamma-new survives', () => {
    expect(slugs(applyVisibleChains(FIXTURE_CHAINS, 'pending', 'slug-asc', PARTIAL))).toEqual(['gamma-new'])
    expect(slugs(applyVisibleChains(FIXTURE_CHAINS, 'pending', 'updated-asc', PARTIAL))).toEqual(['gamma-new'])
  })

  // @blurb Combined closed filter and find set leave only the chain that satisfies
  // @blurb both predicates.
  it('closed + any sort: only zeta-done survives', () => {
    expect(slugs(applyVisibleChains(FIXTURE_CHAINS, 'closed', 'slug-desc', PARTIAL))).toEqual(['zeta-done'])
    expect(slugs(applyVisibleChains(FIXTURE_CHAINS, 'closed', 'updated-asc', PARTIAL))).toEqual(['zeta-done'])
  })

  // @blurb An empty find set (no search matches) must collapse the visible list to
  // @blurb zero results regardless of what the filter and sort would otherwise show.
  it('empty find set returns no results regardless of filter or sort', () => {
    expect(applyVisibleChains(FIXTURE_CHAINS, 'all', 'slug-asc', new Set())).toEqual([])
    expect(applyVisibleChains(FIXTURE_CHAINS, 'in-progress', 'updated-desc', new Set())).toEqual([])
  })

  // @blurb A null find set signals that no search is active — the full filtered and
  // @blurb sorted list must be returned without any intersection step.
  it('null findSlugs returns the full filtered+sorted list (no search active)', () => {
    expect(slugs(applyVisibleChains(FIXTURE_CHAINS, 'in-progress', 'slug-asc', null))).toEqual([
      'alpha-work', 'beta-work',
    ])
    expect(slugs(applyVisibleChains(FIXTURE_CHAINS, 'pending', 'updated-desc', null))).toEqual([
      'delta-new', 'gamma-new',
    ])
  })
})

// ---------------------------------------------------------------------------
// computeChainHeaderStats
// ---------------------------------------------------------------------------

// Chain with status='open' but all tasks finished — chainProgressBucket returns
// 'closed' so computeChainHeaderStats must count it in the closed bucket even
// though its raw status field is 'open'. This is the regression case that caused
// the inflated open count observed in production (9 such chains at the time).
const EFFECTIVELY_CLOSED: ChainSummary = {
  slug: 'all-tasks-done-not-formally-closed',
  status: 'open',
  tasks_total: 4,
  tasks_pending: 0,
  tasks_active: 0,
  tasks_closed: 3,
  tasks_cancelled: 1,
  updated_at: '2026-04-20T00:00:00Z',
}

// Chain with status='open' and every task cancelled (no formally-closed tasks).
// chainProgressBucket still returns 'closed' because finished >= total.
const ALL_CANCELLED: ChainSummary = {
  slug: 'all-tasks-cancelled',
  status: 'open',
  tasks_total: 2,
  tasks_pending: 0,
  tasks_active: 0,
  tasks_closed: 0,
  tasks_cancelled: 2,
  updated_at: '2026-04-21T00:00:00Z',
}

describe('computeChainHeaderStats', () => {
  // @blurb An empty chain list must produce all-zero stats rather than undefined or NaN,
  // @blurb so the summary header renders cleanly on a fresh database.
  it('returns zeros for empty chain list', () => {
    const stats = computeChainHeaderStats([])
    expect(stats).toEqual({ total: 0, open: 0, closed: 0, tasksClosedTotal: 0, tasksTotalAll: 0 })
  })

  // @blurb Open/closed aggregation delegates to chainProgressBucket, not the raw status
  // @blurb field — this keeps the header consistent with the list-view filter buckets.
  it('counts open vs closed chains by progress bucket, not raw status', () => {
    const chains: ChainSummary[] = [
      { ...IN_PROGRESS },   // progress bucket: 'in-progress' → open
      { ...PENDING },       // progress bucket: 'pending'      → open
      { ...CLOSED },        // progress bucket: 'closed'       → closed
    ]
    const stats = computeChainHeaderStats(chains)
    expect(stats.total).toBe(3)
    expect(stats.open).toBe(2)
    expect(stats.closed).toBe(1)
  })

  // @blurb An open-status chain whose every task is finished (closed + cancelled ≥ total)
  // @blurb must be counted as closed in the header even though its status field is 'open'.
  // @blurb Regression: before the fix this class of chain inflated the open count.
  it('counts an open-status chain with all tasks done as closed', () => {
    const stats = computeChainHeaderStats([EFFECTIVELY_CLOSED, IN_PROGRESS])
    expect(stats.total).toBe(2)
    expect(stats.closed).toBe(1)   // EFFECTIVELY_CLOSED — all tasks finished
    expect(stats.open).toBe(1)     // IN_PROGRESS — still has pending work
  })

  // @blurb An open-status chain where every task was cancelled still counts as closed —
  // @blurb the all-cancelled case is finished even though no tasks were formally closed.
  it('counts an open-status chain with all tasks cancelled as closed', () => {
    const stats = computeChainHeaderStats([ALL_CANCELLED])
    expect(stats.closed).toBe(1)
    expect(stats.open).toBe(0)
  })

  // @blurb Retired chains are counted as closed for summary purposes, consistent with how
  // @blurb they appear in the status filter.
  it('treats retired as closed', () => {
    const retired: ChainSummary = { ...CLOSED, status: 'retired' }
    const stats = computeChainHeaderStats([retired, IN_PROGRESS])
    expect(stats.closed).toBe(1)
    expect(stats.open).toBe(1)
  })

  // @blurb The tasks-closed total sums tasks_closed (formally closed, not cancelled) across
  // @blurb all chains so the header ratio reflects completed work, not abandoned tasks.
  it('sums tasks_closed across all chains', () => {
    const a: ChainSummary = { ...IN_PROGRESS, tasks_closed: 3, tasks_total: 5 }
    const b: ChainSummary = { ...PENDING, tasks_closed: 0, tasks_total: 4 }
    const stats = computeChainHeaderStats([a, b])
    expect(stats.tasksClosedTotal).toBe(3)
    expect(stats.tasksTotalAll).toBe(9)
  })

  // @blurb The total task count includes closed-chain tasks so the X/Y ratio in the header
  // @blurb reflects the full project scope, not just active work.
  it('sums tasks_total including closed chains', () => {
    const stats = computeChainHeaderStats([IN_PROGRESS, CLOSED, PENDING])
    expect(stats.tasksTotalAll).toBe(IN_PROGRESS.tasks_total + CLOSED.tasks_total + PENDING.tasks_total)
  })

  // @blurb A mixed set hitting every progress bucket — in-progress, pending, closed-by-status,
  // @blurb and effectively-closed open chains — must produce correct open/closed totals that
  // @blurb match the list-view filter counts.
  it('correctly partitions a mixed set covering all progress buckets', () => {
    const chains = [
      IN_PROGRESS,        // in-progress → open
      PENDING,            // pending     → open
      CLOSED,             // closed      → closed
      { ...CLOSED, slug: 'also-closed', status: 'retired' as const },  // retired → closed
      EFFECTIVELY_CLOSED, // open status but all done → closed
      ALL_CANCELLED,      // open status but all cancelled → closed
    ]
    const stats = computeChainHeaderStats(chains)
    expect(stats.total).toBe(6)
    expect(stats.open).toBe(2)    // IN_PROGRESS + PENDING
    expect(stats.closed).toBe(4)  // CLOSED + retired + EFFECTIVELY_CLOSED + ALL_CANCELLED
  })
})
