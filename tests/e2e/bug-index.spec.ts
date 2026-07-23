import { expect, test } from '@playwright/test'
import { apiRoute } from './lib/api-route'

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const BUGS = [
  {
    slug: 'task-row-not-highlighted',
    title: 'Task row not highlighted after navigation',
    status: 'open',
    surface: 'dashboard',
    severity: 'medium',
    filed_at: '2026-04-24T10:00:00Z',
    resolved_at: null,
  },
  {
    slug: 'l1-snapshot-wrong-path',
    title: 'L1 snapshot fails on first run',
    status: 'fixed',
    surface: 'smoke-tests',
    severity: 'low',
    filed_at: '2026-04-20T08:00:00Z',
    resolved_at: '2026-04-20T09:00:00Z',
  },
]

const BUG_DETAILS: Record<string, object> = {
  'task-row-not-highlighted': {
    slug: 'task-row-not-highlighted',
    title: 'Task row not highlighted after navigation',
    problem_statement: 'After navigating to a task via deep-link, the row is not visually highlighted.',
    surface: 'dashboard',
    severity: 'medium',
    source: 'playwright-session',
    acceptance_criteria: 'Row is highlighted on selection regardless of navigation path.',
    constraints: 'Must not break existing selection logic.',
    status: 'open',
    resolution_note: '',
    routed_chain_slug: '',
    routed_task_slug: '',
    filed_at: '2026-04-24T10:00:00Z',
    resolved_at: null,
    resolved_commit_sha: null,
    resolved_dirty: null,
    spawned_successor_slug: null,
    recurrence_candidates: null,
    resolution_kind: null,
  },
  'l1-snapshot-wrong-path': {
    slug: 'l1-snapshot-wrong-path',
    title: 'L1 snapshot fails on first run',
    problem_statement: 'The L1 snapshot test fails on first run due to a wrong path assumption.',
    surface: 'smoke-tests',
    severity: 'low',
    source: 'ci',
    acceptance_criteria: 'Snapshot passes on first run.',
    constraints: '',
    status: 'fixed',
    resolution_note: 'Fixed the path resolution in smoke-tests/src/lib.rs.',
    routed_chain_slug: '',
    routed_task_slug: '',
    filed_at: '2026-04-20T08:00:00Z',
    resolved_at: '2026-04-20T09:00:00Z',
    resolved_commit_sha: 'deadbeef',
    resolved_dirty: false,
    spawned_successor_slug: null,
    recurrence_candidates: null,
    resolution_kind: null,
  },
}

// ---------------------------------------------------------------------------
// Setup — mock GET /bugs and GET /bugs/counts for every test.
//
// observe-http exposes /bugs (the row list, with optional status /
// severity / surface / project query params) and /bugs/counts (the
// aggregate endpoint — see go/internal/observehttp/counts.go). The
// dashboard's listBugs() / readBug() read /bugs and derive client-side;
// getBugResolutionMix() reads /bugs/counts?group_by=status, because the
// list endpoint caps at 1000 rows and summing it undercounted any larger
// corpus.
//
// Both mocks derive from the single BUGS fixture, so the counts strip and
// the row list can never disagree, and journey 7 asserts fixture numbers
// regardless of what the live corpus holds. Earlier versions of the API
// had separate /bugs/list, /bugs/read, and /bugs/resolution-mix
// endpoints; those were consolidated into /bugs with client-side
// derivation. The earlier multi-endpoint mocks lingered in this spec and
// silently failed (the route patterns never matched the consolidated
// URL); fixed during T6a equivalence verification when the harness
// surfaced 9 identical failures against both live and rebuilt-from-events
// daemon state.
// ---------------------------------------------------------------------------

// Build the response row array the dashboard renders. listBugs maps the
// observehttp row shape (ObserveBugRow) one-to-one onto BugListItem;
// the BUGS fixture matches that adapted shape, so the response body is
// the bugs array directly (no { bugs, count } wrapper — observehttp
// returns a bare JSON array).
function matchingBugs(url: URL): typeof BUGS {
  const status   = url.searchParams.get('status')
  const severity = url.searchParams.get('severity')
  let bugs = [...BUGS]
  if (status)   bugs = bugs.filter(b => b.status === status)
  if (severity) bugs = bugs.filter(b => b.severity === severity)
  return bugs
}

function bugsResponseFor(url: URL): unknown {
  return matchingBugs(url)
}

// Mirrors observehttp.countResponse: ungrouped → { total }, grouped →
// { total, group_by, buckets }. Buckets omit zero-count statuses exactly
// like the backend does (it GROUP BYs over present rows), which is what
// makes getBugResolutionMix's `?? 0` defaulting load-bearing.
function countsResponseFor(url: URL): unknown {
  const bugs = matchingBugs(url)
  const groupBy = url.searchParams.get('group_by')
  if (!groupBy) return { total: bugs.length }
  const buckets: Record<string, number> = {}
  for (const bug of bugs) {
    const key = String((bug as Record<string, unknown>)[groupBy] ?? '')
    buckets[key] = (buckets[key] ?? 0) + 1
  }
  return { total: bugs.length, group_by: groupBy, buckets }
}

test.beforeEach(async ({ page }) => {
  // apiRoute pins both mocks to the API host, so the page-navigation
  // document load at http://localhost:5180/bugs (Playwright's
  // `page.goto('/bugs')` — the dashboard renders the BugIndex page at
  // that route) can't match: fulfilling it would return the JSON array
  // as the page body and the React app would never bootstrap. See
  // FRONTEND_CONVENTIONS.md — never call page.route() directly for
  // observe-http endpoints.
  //
  // The /bugs pattern stops at `?` or end-of-string, so it does not
  // swallow /bugs/counts; the two routes are disjoint.
  await apiRoute(page, /\/bugs\/counts(\?|$)/, async route => {
    const url = new URL(route.request().url())
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(countsResponseFor(url)),
    })
  })

  await apiRoute(page, /\/bugs(\?|$)/, async route => {
    const url = new URL(route.request().url())
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(bugsResponseFor(url)),
    })
  })

  // BUG_DETAILS is unused now that readBug derives client-side;
  // preserved as a fixture shape in case the spec ever asserts against
  // a richer detail surface (T6a-followup that would need a
  // /bugs/{slug} endpoint to come back).
  void BUG_DETAILS
})

// ---------------------------------------------------------------------------
// Journey 1 — page loads and shows bug rows
// ---------------------------------------------------------------------------

// @blurb The bug index page opens with status=open by default, fetching only
// @blurb open bugs on mount. The open bug row must be visible and no other rows
// @blurb should appear until the filter is changed.
test('1: page loads and renders bug rows', async ({ page }) => {
  await page.goto('/bugs')

  await expect(page.locator('[data-testid="bug-row"]').first()).toBeVisible()
  await expect(page.locator('[data-testid="bug-row"]')).toHaveCount(1)
  await expect(page.locator('[data-bug-slug="task-row-not-highlighted"]')).toBeVisible()
})

// ---------------------------------------------------------------------------
// Journey 2 — status filter sends status param to the API
// ---------------------------------------------------------------------------

// @blurb The page defaults to status=open, so the initial request already
// @blurb carries that param. Switching to 'fixed' sends status=fixed and narrows
// @blurb the list to the fixed bug.
test('2: status filter sends status param to /bugs/list', async ({ page }) => {
  await page.goto('/bugs')
  await expect(page.locator('[data-testid="bug-row"]').first()).toBeVisible()
  // Default filter is open — status select shows 'Open'.
  await expect(page.getByTestId('bug-status-filter')).toHaveValue('open')

  const req = page.waitForRequest(r => /\/bugs(\?|$)/.test(r.url()))
  await page.getByTestId('bug-status-filter').selectOption('fixed')
  const r = await req

  expect(new URL(r.url()).searchParams.get('status')).toBe('fixed')

  // Only the fixed bug should remain visible.
  await expect(page.locator('[data-testid="bug-row"]')).toHaveCount(1)
  await expect(
    page.locator('[data-bug-slug="l1-snapshot-wrong-path"]'),
  ).toBeVisible()
})

// ---------------------------------------------------------------------------
// Journey 3 — severity filter sends severity param to the API
// ---------------------------------------------------------------------------

// @blurb Selecting a severity filters the request to that severity level,
// @blurb narrowing the list to bugs matching the chosen priority.
test('3: severity filter sends severity param to /bugs/list', async ({ page }) => {
  await page.goto('/bugs')
  await expect(page.locator('[data-testid="bug-row"]').first()).toBeVisible()

  const req = page.waitForRequest(r => /\/bugs(\?|$)/.test(r.url()))
  await page.getByTestId('bug-severity-filter').selectOption('medium')
  const r = await req

  expect(new URL(r.url()).searchParams.get('severity')).toBe('medium')

  await expect(page.locator('[data-testid="bug-row"]')).toHaveCount(1)
})

// ---------------------------------------------------------------------------
// Journey 4 — text search filters rows client-side across slug, title, surface
// ---------------------------------------------------------------------------

// @blurb The search input filters the already-fetched bug list client-side by
// @blurb matching the query against slug, title, and surface — no extra API call.
test('4: text search filters visible rows by slug, title, or surface without re-fetching', async ({ page }) => {
  await page.goto('/bugs')
  // Switch to 'all' so both bugs are loaded before testing client-side search.
  await page.getByTestId('bug-status-filter').selectOption('all')
  await expect(page.locator('[data-testid="bug-row"]')).toHaveCount(2)

  // Match on surface tag — 'smoke-tests' only appears on l1-snapshot-wrong-path
  await page.getByTestId('bug-search-filter').fill('smoke-tests')
  await expect(page.locator('[data-testid="bug-row"]')).toHaveCount(1)
  await expect(page.locator('[data-bug-slug="l1-snapshot-wrong-path"]')).toBeVisible()

  // Match on title fragment — 'navigation' only in task-row-not-highlighted
  await page.getByTestId('bug-search-filter').fill('navigation')
  await expect(page.locator('[data-testid="bug-row"]')).toHaveCount(1)
  await expect(page.locator('[data-bug-slug="task-row-not-highlighted"]')).toBeVisible()

  // Clearing restores both rows
  await page.getByTestId('bug-search-filter').fill('')
  await expect(page.locator('[data-testid="bug-row"]')).toHaveCount(2)
})

// ---------------------------------------------------------------------------
// Journey 5 — refresh button re-fetches the bug list
// ---------------------------------------------------------------------------

// @blurb The Refresh button triggers a new /bugs/list fetch so the user can
// @blurb pick up any changes without a full page reload.
test('5: refresh button re-fetches /bugs/list', async ({ page }) => {
  await page.goto('/bugs')
  await expect(page.locator('[data-testid="bug-row"]').first()).toBeVisible()

  const secondFetch = page.waitForResponse(r => /\/bugs(\?|$)/.test(r.url()))
  await page.getByRole('button', { name: 'Refresh' }).click()
  await secondFetch
})

// ---------------------------------------------------------------------------
// Journey 6 — clicking a bug row opens the detail panel
// ---------------------------------------------------------------------------

// @blurb Clicking a bug row populates the detail panel with that bug's slug,
// @blurb title, status, severity, surface, and filing date without a page reload.
test('6: clicking a bug row opens the detail panel showing the bug slug', async ({ page }) => {
  await page.goto('/bugs')
  await expect(page.locator('[data-testid="bug-row"]').first()).toBeVisible()

  // Detail panel starts with placeholder
  await expect(page.getByText('Select a bug to see its details.')).toBeVisible()

  // Click the first bug row
  const firstSlug = await page.locator('[data-testid="bug-row"]').first().getAttribute('data-bug-slug')
  await page.locator('[data-testid="bug-row"]').first().click()

  // Detail panel shows the selected bug's slug
  await expect(page.getByTestId('bug-detail-panel')).toBeVisible()
  await expect(page.getByTestId('bug-detail-slug')).toHaveText(String(firstSlug))

  // Row is marked as selected
  await expect(
    page.locator(`[data-bug-slug="${firstSlug}"]`),
  ).toHaveAttribute('aria-selected', 'true')
})

// ---------------------------------------------------------------------------
// Journey 8 — selecting a bug opens the detail panel with full bug_read data
// ---------------------------------------------------------------------------

// @blurb Clicking a bug row populates the detail panel from the bug row
// @blurb already fetched via GET /bugs (the dashboard does client-side
// @blurb filter-by-slug; no separate /bugs/{slug} fetch is made now that
// @blurb the API consolidated to a single endpoint).
test('8: selecting a bug opens the detail panel with full field data from /bugs row', async ({ page }) => {
  await page.goto('/bugs')
  await expect(page.locator('[data-testid="bug-row"]').first()).toBeVisible()

  // Click the open bug row (task-row-not-highlighted; status=open is default).
  await page.locator('[data-bug-slug="task-row-not-highlighted"]').click()

  // Detail panel reflects the selected bug's slug.
  await expect(page.getByTestId('bug-detail-slug')).toHaveText('task-row-not-highlighted')

  // Severity / surface / status surface from the bug row.
  await expect(page.getByTestId('bug-detail-severity')).toHaveText('medium')
  await expect(page.getByTestId('bug-detail-surface')).toBeVisible()
})

// @blurb Selecting a fixed bug surfaces its status and resolved_at from the
// @blurb row shape. resolution_note + resolution_kind aren't on /bugs's
// @blurb response shape (those would need a /bugs/{slug} endpoint that
// @blurb the dashboard doesn't currently call); see follow-up bug
// @blurb `bug-detail-panel-missing-resolution-fields-after-api-consolidation`.
test('8b: resolved bug detail panel surfaces row-shape fields', async ({ page }) => {
  await page.goto('/bugs')
  // Switch to 'all' so the fixed bug is visible.
  await page.getByTestId('bug-status-filter').selectOption('all')
  await expect(page.locator('[data-testid="bug-row"]').first()).toBeVisible()

  await page.locator('[data-bug-slug="l1-snapshot-wrong-path"]').click()
  await expect(page.getByTestId('bug-detail-slug')).toHaveText('l1-snapshot-wrong-path')
  await expect(page.getByTestId('bug-detail-severity')).toHaveText('low')
  await expect(page.getByTestId('bug-detail-surface')).toBeVisible()
})

// ---------------------------------------------------------------------------
// Journey 7 — resolution breakdown reads the /bugs/counts aggregate
// ---------------------------------------------------------------------------

// @blurb The resolution breakdown strip shows corpus-wide counts from the
// @blurb /bugs/counts aggregate endpoint grouped by status. The dashboard's
// @blurb getBugResolutionMix reads it rather than summing the /bugs rows,
// @blurb because that list caps at 1000 and would undercount a larger corpus.
test('7: resolution breakdown shows counts from /bugs/counts', async ({ page }) => {
  await page.goto('/bugs')
  await expect(page.locator('[data-testid="bug-row"]').first()).toBeVisible()

  const breakdown = page.getByTestId('resolution-breakdown')
  await expect(breakdown).toBeVisible()

  // BUGS fixture: 1 open ('task-row-not-highlighted') + 1 fixed
  // ('l1-snapshot-wrong-path'). Other statuses zero in the fixture.
  await expect(
    breakdown.locator('[data-resolution-status="open"] [data-testid="resolution-count"]'),
  ).toHaveText('1')
  await expect(
    breakdown.locator('[data-resolution-status="fixed"] [data-testid="resolution-count"]'),
  ).toHaveText('1')
  await expect(
    breakdown.locator('[data-resolution-status="wontfix"] [data-testid="resolution-count"]'),
  ).toHaveText('0')
  await expect(
    breakdown.locator('[data-resolution-status="routed"] [data-testid="resolution-count"]'),
  ).toHaveText('0')
  await expect(
    breakdown.locator('[data-resolution-status="dup"] [data-testid="resolution-count"]'),
  ).toHaveText('0')
})

// ---------------------------------------------------------------------------
// Journey 9 — resolution breakdown renders all five kinds (zeros shown)
// ---------------------------------------------------------------------------

// @blurb The widget renders all five status chips on mount; kinds with
// @blurb zero bugs appear as "0" rather than being hidden. Aggregation
// @blurb is client-side from /bugs (no dedicated /bugs/resolution-mix
// @blurb fetch in the consolidated API).
test('9: resolution breakdown renders all five kinds (zeros shown)', async ({ page }) => {
  await page.goto('/bugs')

  const breakdown = page.getByTestId('resolution-breakdown')
  await expect(breakdown).toBeVisible()

  // All five status-kind chips are present (the widget may also render
  // a roll-up chip for total counts; assert >= 5 not exactly 5).
  const chips = breakdown.locator('[data-testid="resolution-chip"]')
  expect((await chips.count()) >= 5).toBe(true)

  // Each of the 5 named statuses has a count cell (zeros included).
  for (const status of ['open', 'fixed', 'wontfix', 'routed', 'dup']) {
    await expect(
      breakdown.locator(`[data-resolution-status="${status}"] [data-testid="resolution-count"]`),
    ).toBeVisible()
  }
})
