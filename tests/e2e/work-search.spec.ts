import { expect, test } from '@playwright/test'

// File-level skip: this spec exercises a page that has been moved to
// src/pages/_dormant/. The page is no longer routed and the assertions
// fail with 404 / locator-not-found. Restore the page (move out of
// _dormant/ + register a route) before re-enabling. Filed as bug
// dashboard-playwright-tests-not-in-ci-quietly-rotted-since-cd5d3cf
// and its T16 follow-up.
test.skip()

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const CHAINS = [
  {
    slug: 'work-port-tier2-reads',
    status: 'open',
    tasks_total: 3,
    tasks_pending: 2,
    tasks_closed: 0,
    tasks_cancelled: 0,
    updated_at: '2026-04-25T01:00:00Z',
  },
  {
    slug: 'work-port-nav-validation',
    status: 'open',
    tasks_total: 3,
    tasks_pending: 1,
    tasks_closed: 2,
    tasks_cancelled: 0,
    updated_at: '2026-04-24T18:30:00Z',
  },
  {
    slug: 'mcp-servers-migration',
    status: 'closed',
    tasks_total: 3,
    tasks_pending: 0,
    tasks_closed: 3,
    tasks_cancelled: 0,
    updated_at: '2026-04-20T09:00:00Z',
  },
]

const CHAIN_RESULTS = [
  { slug: 'work-port-tier2-reads',  status: 'open',   tasks_total: 3, tasks_closed: 0, score: 1.5 },
  { slug: 'work-port-nav-validation', status: 'open', tasks_total: 3, tasks_closed: 2, score: 0.75 },
]

const TASK_RESULTS = [
  {
    chain_slug: 'work-port-tier2-reads',
    chain_status: 'open',
    task_slug: 'port-get-chain-state',
    task_status: 'active',
    field: 'problem_statement',
    snippet: '…Port get_chain_state to work-server end-to-end…',
  },
  {
    chain_slug: 'work-port-nav-validation',
    chain_status: 'open',
    task_slug: 'port-validate-filename',
    task_status: 'closed',
    field: 'problem_statement',
    snippet: '…Port validate_filename to work-server…',
  },
]

const CHAIN_STATE = {
  found: true,
  chain_slug: 'work-port-tier2-reads',
  chain_path: null,
  tasks: [
    { order: 1, slug: 'port-get-chain-state', status: 'active',  problem_statement: 'Port get_chain_state to work-server end-to-end.' },
    { order: 2, slug: 'view-get-chain-state', status: 'pending', problem_statement: 'Build the task/chain index page.' },
    { order: 3, slug: 'port-chain-status',    status: 'pending', problem_statement: 'Port chain_status to work-server.' },
  ],
  output: 'Four DB-backed read handlers and a live task/chain index page.',
  design_decisions: 'Reuse SqlitePool from T13.',
  completion_condition: 'All four Tier 2 tools ported and pages live.',
}

// ---------------------------------------------------------------------------
// Setup — mock all API endpoints for every test
// ---------------------------------------------------------------------------

test.beforeEach(async ({ page }) => {
  await page.route(/\/chains\/status$/, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ chains: CHAINS }),
    }),
  )

  await page.route(/\/chains\/find/, async route => {
    const url = new URL(route.request().url())
    const query = url.searchParams.get('query') ?? ''
    const results = query.trim()
      ? CHAIN_RESULTS.filter(c => c.slug.includes(query.toLowerCase().split(/\s+/)[0]))
      : []
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        found: results.length > 0,
        query,
        results,
        ...(results.length === 0 ? { note: 'No chains matched.' } : {}),
      }),
    })
  })

  await page.route(/\/tasks\/search/, async route => {
    const url = new URL(route.request().url())
    const pattern = url.searchParams.get('pattern') ?? ''
    const chainStatus = url.searchParams.get('chain_status')
    let matches = pattern.trim() ? TASK_RESULTS : []
    if (chainStatus === 'closed') {
      matches = matches.filter(m => m.chain_status === 'closed')
    } else if (chainStatus === 'open') {
      matches = matches.filter(m => m.chain_status === 'open')
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ count: matches.length, truncated: false, pattern, matches }),
    })
  })

  await page.route(/\/chains\/state/, async route => {
    const url = new URL(route.request().url())
    const slug = url.searchParams.get('chain_slug') ?? ''
    const state = slug === 'work-port-tier2-reads'
      ? CHAIN_STATE
      : { found: false, chain_slug: slug, error: 'chain not found' }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(state),
    })
  })
})

// ---------------------------------------------------------------------------
// Journey 1 — typing fires both /chains/find and /tasks/search in parallel
// ---------------------------------------------------------------------------

// @blurb The search input triggers parallel requests to both /chains/find and /tasks/search
// @blurb simultaneously, minimising latency compared to sequential fetches.
test('1: typing in the search input calls both find_chain and tasks/search', async ({ page }) => {
  await page.goto('/work/search')

  const findReq   = page.waitForRequest(r => r.url().includes('/chains/find'))
  const searchReq = page.waitForRequest(r => r.url().includes('/tasks/search'))

  await page.getByTestId('work-search-input').fill('port')

  const [find, search] = await Promise.all([findReq, searchReq])

  expect(new URL(find.url()).searchParams.get('query')).toBe('port')
  expect(new URL(search.url()).searchParams.get('pattern')).toBe('port')
})

// ---------------------------------------------------------------------------
// Journey 2 — count label shows "N chains · M tasks" after results arrive
// ---------------------------------------------------------------------------

// @blurb After both searches complete, the controls bar summarises total result counts so
// @blurb the user can gauge the search's reach before browsing individual results.
test('2: count label shows N chains · M tasks after search completes', async ({ page }) => {
  await page.goto('/work/search')

  const bothDone = Promise.all([
    page.waitForResponse(/\/chains\/find/),
    page.waitForResponse(/\/tasks\/search/),
  ])
  await page.getByTestId('work-search-input').fill('port')
  await bothDone

  await expect(page.getByTestId('chain-count')).toContainText('chains')
  await expect(page.getByTestId('chain-count')).toContainText('tasks')
})

// ---------------------------------------------------------------------------
// Journey 3 — chain results appear in Chains panel, task results in Tasks panel
// ---------------------------------------------------------------------------

// @blurb Results are segregated into their own panels rather than mixed, preserving the
// @blurb semantic distinction between chain-level and task-level matches.
test('3: chain results appear in Chains panel and task results appear in Tasks panel', async ({ page }) => {
  await page.goto('/work/search')

  const bothDone = Promise.all([
    page.waitForResponse(/\/chains\/find/),
    page.waitForResponse(/\/tasks\/search/),
  ])
  await page.getByTestId('work-search-input').fill('port')
  await bothDone

  // Chains panel has chain result items
  await expect(page.locator('[data-testid="chain-result"]').first()).toBeVisible()
  await expect(
    page.locator('[data-testid="chain-result"][data-chain-slug="work-port-tier2-reads"]'),
  ).toBeVisible()

  // Tasks panel has task result items
  await expect(page.locator('[data-testid="task-result"]').first()).toBeVisible()
  await expect(page.locator('[data-testid="task-result-slug"]').first()).toContainText('port-')
  await expect(page.locator('[data-testid="task-result-field"]').first()).toBeVisible()
})

// ---------------------------------------------------------------------------
// Journey 4 — clicking a chain result opens detail panel while results persist
// ---------------------------------------------------------------------------

// @blurb The detail panel opens alongside the result lists which remain fully visible so
// @blurb the user can scrub through options without losing context.
test('4: clicking a chain result opens detail panel without clearing the result lists', async ({ page }) => {
  await page.goto('/work/search')

  const bothDone = Promise.all([
    page.waitForResponse(/\/chains\/find/),
    page.waitForResponse(/\/tasks\/search/),
  ])
  await page.getByTestId('work-search-input').fill('port')
  await bothDone

  await page.locator('[data-chain-slug="work-port-tier2-reads"]').click()

  // Chain and task result lists are still visible
  await expect(page.locator('[data-testid="chain-result"]').first()).toBeVisible()
  await expect(page.locator('[data-testid="task-result"]').first()).toBeVisible()

  // Detail panel shows the chain detail (count strip loaded)
  await expect(page.locator('[data-testid="detail-chain-counts"]')).toBeVisible()

  // Chain toggle is active
  await expect(page.getByTestId('detail-toggle-chain')).toHaveAttribute('aria-pressed', 'true')

  // Search input still has the query
  await expect(page.getByTestId('work-search-input')).toHaveValue('port')
})

// ---------------------------------------------------------------------------
// Journey 5 — clicking a task result opens task detail with slug, field, snippet
// ---------------------------------------------------------------------------

// @blurb Task detail shows the matched field name and a content excerpt with the search term
// @blurb highlighted, letting the user evaluate relevance without navigating away.
test('5: clicking a task result opens task detail with slug, field label, and highlighted snippet', async ({ page }) => {
  await page.goto('/work/search')

  const bothDone = Promise.all([
    page.waitForResponse(/\/chains\/find/),
    page.waitForResponse(/\/tasks\/search/),
  ])
  await page.getByTestId('work-search-input').fill('port')
  await bothDone

  await page.locator('[data-testid="task-result"]').first().click()

  // Detail panel switches to task mode and shows task slug
  await expect(page.getByTestId('detail-toggle-task')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('task-detail-slug')).toBeVisible()
  await expect(page.getByTestId('task-detail-slug')).toContainText('port-')

  // Matched excerpt is visible
  await expect(page.getByTestId('task-detail-snippet')).toBeVisible()

  // Result lists still visible
  await expect(page.locator('[data-testid="chain-result"]').first()).toBeVisible()
  await expect(page.locator('[data-testid="task-result"]').first()).toBeVisible()
})

// ---------------------------------------------------------------------------
// Journey 6 — Chain/Task toggle switches the detail view
// ---------------------------------------------------------------------------

// @blurb After clicking a task result, the toggle lets the user flip to the parent chain's
// @blurb detail view and back, providing dual context without a separate navigation step.
test('6: Chain/Task toggle switches between chain and task detail views', async ({ page }) => {
  await page.goto('/work/search')

  const bothDone = Promise.all([
    page.waitForResponse(/\/chains\/find/),
    page.waitForResponse(/\/tasks\/search/),
  ])
  await page.getByTestId('work-search-input').fill('port')
  await bothDone

  // Click a task result — starts in task mode
  await page.locator('[data-testid="task-result"]').first().click()
  await expect(page.getByTestId('detail-toggle-task')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('task-detail-slug')).toBeVisible()

  // Toggle to chain mode — shows chain detail
  await page.getByTestId('detail-toggle-chain').click()
  await expect(page.getByTestId('detail-toggle-chain')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('[data-testid="detail-chain-counts"]')).toBeVisible()

  // Toggle back to task mode
  await page.getByTestId('detail-toggle-task').click()
  await expect(page.getByTestId('detail-toggle-task')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('task-detail-slug')).toBeVisible()
})

// ---------------------------------------------------------------------------
// Journey 7 — "Go to planning dash" for a chain navigates with ?chain= param
// ---------------------------------------------------------------------------

// @blurb The 'Go to planning dash' button encodes the selected chain slug so the Task
// @blurb Planning Dash can restore the selection on arrival via URL params.
test('7: go-to-planning for a chain navigates to /tasks/chains?chain=<slug>', async ({ page }) => {
  await page.goto('/work/search')

  const bothDone = Promise.all([
    page.waitForResponse(/\/chains\/find/),
    page.waitForResponse(/\/tasks\/search/),
  ])
  await page.getByTestId('work-search-input').fill('port')
  await bothDone

  await page.locator('[data-chain-slug="work-port-tier2-reads"]').click()
  await expect(page.locator('[data-testid="detail-chain-counts"]')).toBeVisible()

  await page.getByTestId('go-to-planning').click()

  await page.waitForURL(/\/tasks\/chains/)
  const url = new URL(page.url())
  expect(url.pathname).toBe('/tasks/chains')
  expect(url.searchParams.get('chain')).toBe('work-port-tier2-reads')
  expect(url.searchParams.get('task')).toBeNull()
})

// ---------------------------------------------------------------------------
// Journey 8 — "Go to planning dash" for a task navigates with ?chain=&task=
// and the planning dash pre-selects the chain and highlights the task row
// ---------------------------------------------------------------------------

// @blurb For task selections both the chain and task slugs are encoded, and the Task Planning
// @blurb Dash highlights the specific task row and opens Task mode in the right panel on arrival.
test('8: go-to-planning for a task navigates with ?chain=&task= and planning dash highlights the task', async ({ page }) => {
  await page.goto('/work/search')

  const bothDone = Promise.all([
    page.waitForResponse(/\/chains\/find/),
    page.waitForResponse(/\/tasks\/search/),
  ])
  await page.getByTestId('work-search-input').fill('port')
  await bothDone

  await page.locator('[data-testid="task-result"]').first().click()
  await expect(page.getByTestId('task-detail-slug')).toBeVisible()

  const taskSlug = await page.getByTestId('task-detail-slug').textContent()

  await page.getByTestId('go-to-planning').click()

  await page.waitForURL(/\/tasks\/chains/)
  const url = new URL(page.url())
  expect(url.pathname).toBe('/tasks/chains')
  expect(url.searchParams.get('chain')).toBeTruthy()
  expect(url.searchParams.get('task')).toBe(taskSlug)

  // Planning dash loads and highlights the task row
  await expect(page.locator('[data-testid="task-row"]').first()).toBeVisible()
  await expect(
    page.locator(`[data-task-slug="${taskSlug}"]`),
  ).toHaveAttribute('aria-selected', 'true')
})

// ---------------------------------------------------------------------------
// Journey 9 — status filter 'closed' sends chain_status=closed to /tasks/search
// ---------------------------------------------------------------------------

// @blurb The status filter propagates to the /tasks/search request as a chain_status
// @blurb parameter, restricting task results to the selected chain lifecycle state.
test('9: setting status filter to Closed sends chain_status=closed to tasks/search', async ({ page }) => {
  await page.goto('/work/search')

  await page.getByTestId('work-search-input').fill('port')
  await page.waitForResponse(/\/tasks\/search/)

  // Change filter to closed — re-runs task search
  const nextSearchReq = page.waitForRequest(r => r.url().includes('/tasks/search'))
  await page.getByTestId('chain-status-filter').selectOption('closed')
  const req = await nextSearchReq

  const url = new URL(req.url())
  expect(url.searchParams.get('chain_status')).toBe('closed')
})

// ---------------------------------------------------------------------------
// Journey 10 — refresh button re-runs both searches
// ---------------------------------------------------------------------------

// @blurb The Refresh button re-triggers both parallel search requests, picking up any
// @blurb changes to chain or task content since the last search was run.
test('10: refresh button re-runs both /chains/find and /tasks/search', async ({ page }) => {
  await page.goto('/work/search')

  await page.getByTestId('work-search-input').fill('port')
  await Promise.all([
    page.waitForResponse(/\/chains\/find/),
    page.waitForResponse(/\/tasks\/search/),
  ])

  // Click refresh — both endpoints called again
  const findAgain   = page.waitForResponse(/\/chains\/find/)
  const searchAgain = page.waitForResponse(/\/tasks\/search/)
  await page.getByRole('button', { name: 'Refresh' }).click()
  await Promise.all([findAgain, searchAgain])
})
