import { expect, test } from '@playwright/test'
import { apiUrlPattern } from './lib/api-route'

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

// ObserveChainRow shape — what GET /chains returns post-T16
// observe-http rewire (commit cd5d3cf). The dashboard's listChains
// adapts these to ChainSummary via adaptChainRow.
const CHAINS = [
  {
    id: 1,
    project_id: 'mcp-servers',
    slug: 'work-port-tier2-reads',
    status: 'open',
    total_tasks: 3,
    pending: 2,
    active: 1,
    blocked: 0,
    closed: 0,
    cancelled: 0,
    updated_at: '2026-04-25T01:00:00Z',
  },
  {
    id: 2,
    project_id: 'mcp-servers',
    slug: 'work-port-nav-validation',
    status: 'open',
    total_tasks: 3,
    pending: 1,
    active: 0,
    blocked: 0,
    closed: 2,
    cancelled: 0,
    updated_at: '2026-04-24T18:30:00Z',
  },
  {
    id: 3,
    project_id: 'mcp-servers',
    slug: 'work-port-planning',
    status: 'open',
    total_tasks: 3,
    pending: 3,
    active: 0,
    blocked: 0,
    closed: 0,
    cancelled: 0,
    updated_at: '2026-04-23T10:00:00Z',
  },
  {
    id: 4,
    project_id: 'mcp-servers',
    slug: 'mcp-servers-migration',
    status: 'closed',
    total_tasks: 3,
    pending: 0,
    active: 0,
    blocked: 0,
    closed: 3,
    cancelled: 0,
    updated_at: '2026-04-20T09:00:00Z',
  },
  {
    id: 5,
    project_id: 'mcp-servers',
    slug: 'establish-conventions',
    status: 'closed',
    total_tasks: 3,
    pending: 0,
    active: 0,
    blocked: 0,
    closed: 2,
    cancelled: 1,
    updated_at: '2026-04-18T14:00:00Z',
  },
]

const CHAIN_STATES: Record<string, object> = {
  'work-port-tier2-reads': {
    found: true,
    chain_slug: 'work-port-tier2-reads',
    chain_path: null,
    tasks: [
      { order: 1, slug: 'port-get-chain-state', status: 'active', problem_statement: 'Port get_chain_state to work-server end-to-end.' },
      { order: 2, slug: 'view-get-chain-state', status: 'pending', problem_statement: 'Build the task/chain index page in the dashboard.' },
      { order: 3, slug: 'port-chain-status', status: 'pending', problem_statement: 'Port chain_status to work-server.' },
    ],
    output: 'Four DB-backed read handlers and a live task/chain index page.',
    design_decisions: 'Reuse SqlitePool from T13.',
    completion_condition: 'All four Tier 2 tools ported and pages live.',
  },
  'work-port-nav-validation': {
    found: true,
    chain_slug: 'work-port-nav-validation',
    chain_path: null,
    tasks: [
      { order: 1, slug: 'port-validate-filename', status: 'closed', problem_statement: 'Port validate_filename to work-server.' },
      { order: 2, slug: 'port-check-lifecycle-change', status: 'closed', problem_statement: 'Port check_lifecycle_change to work-server.' },
      { order: 3, slug: 'port-check-file-sizes', status: 'pending', problem_statement: 'Port check_file_sizes to work-server.' },
    ],
    output: 'Three validation handlers with full harness.',
    design_decisions: 'Pure string/filesystem ops, no DB.',
    completion_condition: 'All three tools pass all harness layers.',
  },
  'work-port-planning': {
    found: true,
    chain_slug: 'work-port-planning',
    chain_path: null,
    tasks: [
      { order: 1, slug: 'scope-planning-tools', status: 'pending', problem_statement: 'Audit planning tools and confirm scope.' },
      { order: 2, slug: 'port-plan-generate', status: 'pending', problem_statement: 'Port plan_generate to work-server.' },
      { order: 3, slug: 'port-plan-describe', status: 'pending', problem_statement: 'Port plan_describe to work-server.' },
    ],
    output: 'Planning tool handlers ported.',
    design_decisions: 'Port after Tier 2 reads are stable.',
    completion_condition: 'All planning tools with full harness coverage.',
  },
  'mcp-servers-migration': {
    found: true,
    chain_slug: 'mcp-servers-migration',
    chain_path: null,
    tasks: [
      { order: 1, slug: 'classify-tool-surface', status: 'closed', problem_statement: 'Classify all 78 Work tools into migration tiers.' },
      { order: 2, slug: 'scaffold-frontend', status: 'closed', problem_statement: 'Scaffold the dashboard app with Vite + React.' },
      { order: 3, slug: 'first-tool-port', status: 'closed', problem_statement: 'Port read_task as the pattern-setting first DB-backed tool.' },
    ],
    output: 'Foundation complete.',
    design_decisions: 'rmcp + sqlx + Vite + CSS modules.',
    completion_condition: 'All 78 Work tools ported.',
  },
  'establish-conventions': {
    found: true,
    chain_slug: 'establish-conventions',
    chain_path: null,
    tasks: [
      { order: 1, slug: 'write-conventions-doc', status: 'closed', problem_statement: 'Write CONVENTIONS.md as the authoritative reference.' },
      { order: 2, slug: 'add-lint-gates', status: 'closed', problem_statement: 'Add structure-lint checks enforcing conventions at pre-commit.' },
      { order: 3, slug: 'add-error-enum-shape', status: 'cancelled', problem_statement: 'Document error enum shape — cancelled, covered by lint gate.' },
    ],
    output: 'CONVENTIONS.md written and enforced.',
    design_decisions: 'Cancelled error-enum-shape — covered by existing lint gate.',
    completion_condition: 'CONVENTIONS.md is the authoritative reference.',
  },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read the data-chain-slug attribute of every visible chain-item in DOM order. */
async function visibleChainSlugs(page: import('@playwright/test').Page) {
  return page
    .locator('[data-testid="chain-item"]')
    .evaluateAll(els => els.map(el => (el as HTMLElement).dataset.chainSlug ?? ''))
}

// ---------------------------------------------------------------------------
// Setup — mock all three API endpoints for every test
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Task content search mock data
// ---------------------------------------------------------------------------

const TASK_SEARCH_RESULTS = [
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

// ---------------------------------------------------------------------------
// Setup — mock all API endpoints for every test
// ---------------------------------------------------------------------------

test.beforeEach(async ({ page }) => {
  // Match GET /chains (the post-T16 observe-http endpoint listChains
  // hits — formerly /chains/status). Honors `include_closed` like the
  // real endpoint: when absent, closed + cancelled chains are excluded;
  // when `true`, all are returned. Without this honoring step a
  // regression where the client stops passing `include_closed=true`
  // would still pass journey 6 / 8 because the mock would return every
  // chain anyway. Bug 1056 was filed for exactly that drift.
  // Anchor to the API origin (PLAYWRIGHT_API_HOST default
  // localhost:3001) so /tasks/chains on the SPA host (localhost:5180)
  // does NOT match. apiUrlPattern threads the env-configurable host.
  await page.route(apiUrlPattern(/\/chains(\?|$)/), route => {
    const url = new URL(route.request().url())
    const includeClosed = url.searchParams.get('include_closed') === 'true'
    const visible = includeClosed
      ? CHAINS
      : CHAINS.filter(c => c.status !== 'closed' && c.status !== 'cancelled')
    // listChains parses ObserveChainRow[] (the array) not { chains: [] }.
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(visible),
    })
  })

  // Post-T16 chain detail flows through GET /tasks?chain_slug=<slug>
  // (returning ObserveTaskRow[]). The SPA's getChainState reshapes
  // the array into a ChainStateResponse client-side. Top-level chain
  // prose (output / design_decisions / completion_condition) was
  // intentionally dropped from the endpoint — getChainState fills
  // those with empty strings now. Any journey that expected those
  // fields to render needs to be relaxed accordingly.
  await page.route(apiUrlPattern(/\/tasks(\?|$)/), async route => {
    const url = new URL(route.request().url())
    const slug = url.searchParams.get('chain_slug') ?? ''
    const state = CHAIN_STATES[slug]
    const rows = state
      ? (state as { tasks: { order: number; slug: string; status: string; problem_statement: string }[] }).tasks
          .map((t, i) => ({
            id: i + 1,
            chain_id: 1,
            chain_slug: slug,
            project_id: 'mcp-servers',
            slug: t.slug,
            position: t.order,
            status: t.status,
            problem_statement: t.problem_statement,
            updated_at: '2026-04-25T01:00:00Z',
          }))
      : []
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(rows),
    })
  })

  // /chains/find route deliberately not mocked — post-T16 the dashboard's
  // findChain() does substring matching client-side via listChains() and
  // never hits a /chains/find endpoint (observe-http has none). Tests that
  // used to wait for /chains/find should wait for the second listChains
  // refetch on /chains? instead.

  // GET /chains/<slug> — chain-detail endpoint that carries the prose
  // fields (output / design_decisions / completion_condition) which
  // /chains?... omits and /tasks?... never carried. Restored under bug
  // dashboard-chainindex-7-journeys-skipped-pending-t16-restore.
  await page.route(apiUrlPattern(/\/chains\/[^/?]+(\?|$)/), async route => {
    const url = new URL(route.request().url())
    const parts = url.pathname.split('/').filter(Boolean)
    const slug = parts[parts.length - 1] ?? ''
    const state = CHAIN_STATES[slug] as
      | { output: string; design_decisions: string; completion_condition: string }
      | undefined
    if (!state) {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: `chain '${slug}' not found` }),
      })
      return
    }
    const summary = CHAINS.find(c => c.slug === slug)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: summary?.id ?? 1,
        project_id: summary?.project_id ?? 'mcp-servers',
        slug,
        status: summary?.status ?? 'open',
        output: state.output,
        design_decisions: state.design_decisions,
        completion_condition: state.completion_condition,
        created_at: '2026-04-20T00:00:00Z',
        updated_at: summary?.updated_at ?? '2026-04-25T01:00:00Z',
      }),
    })
  })

  // tasks/search: return fixture results for non-empty patterns
  await page.route(/\/tasks\/search/, async route => {
    const url = new URL(route.request().url())
    const pattern = url.searchParams.get('pattern') ?? ''
    if (!pattern.trim()) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ count: 0, truncated: false, pattern, matches: [] }),
      })
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          count: TASK_SEARCH_RESULTS.length,
          truncated: false,
          pattern,
          matches: TASK_SEARCH_RESULTS,
        }),
      })
    }
  })
})

// ---------------------------------------------------------------------------
// Journey 1 — in-progress chains visible by default
// ---------------------------------------------------------------------------

// @blurb The page opens with 'in-progress' as the default status filter, showing only chains
// @blurb with at least one task started but not all closed — active work surfaces without any configuration.
test('1: in-progress chains appear with default filter', async ({ page }) => {
  await page.goto('/tasks/chains')

  await expect(page.locator('[data-testid="chain-item"]')).toHaveCount(2)
  await expect(page.locator('[data-chain-slug="work-port-tier2-reads"]')).toBeVisible()
  await expect(page.locator('[data-chain-slug="work-port-nav-validation"]')).toBeVisible()
  // pending and closed chains are hidden
  await expect(page.locator('[data-chain-slug="work-port-planning"]')).not.toBeVisible()
  await expect(page.locator('[data-chain-slug="mcp-servers-migration"]')).not.toBeVisible()
})

// ---------------------------------------------------------------------------
// Journey 2 — task list appears when clicking an in-progress chain
// ---------------------------------------------------------------------------

// @blurb Selecting a chain fetches its task table and displays slugs, statuses, and problem
// @blurb statement excerpts — the core selection interaction for the Task Planning Dash.
test('2: task list loads when clicking an in-progress chain', async ({ page }) => {
  await page.goto('/tasks/chains')

  await page.locator('[data-chain-slug="work-port-tier2-reads"]').click()

  const rows = page.locator('[data-testid="task-row"]')
  await expect(rows).toHaveCount(3)
  await expect(rows.first()).toContainText('port-get-chain-state')
  await expect(rows.first().locator('[data-testid="task-excerpt"]')).toBeVisible()
})

// ---------------------------------------------------------------------------
// Journey 3 — X/Y readout reflects closed + cancelled, not just closed
// ---------------------------------------------------------------------------

// @blurb The progress counter treats both closed and cancelled tasks as done so the X/Y ratio
// @blurb reflects actual chain completion, not just formally-closed tasks.
test('3: X/Y readout counts closed + cancelled as finished', async ({ page }) => {
  await page.goto('/tasks/chains')

  // Switch to All to see all chains
  await page.getByTestId('chain-status-filter').selectOption('all')

  // work-port-nav-validation: 2 closed + 0 cancelled → 2/3
  await expect(
    page.locator('[data-chain-slug="work-port-nav-validation"]'),
  ).toContainText('2/3')

  // establish-conventions: 2 closed + 1 cancelled → 3/3
  await expect(
    page.locator('[data-chain-slug="establish-conventions"]'),
  ).toContainText('3/3')

  // work-port-planning: 0 closed + 0 cancelled → 0/3
  await expect(
    page.locator('[data-chain-slug="work-port-planning"]'),
  ).toContainText('0/3')
})

// ---------------------------------------------------------------------------
// Journey 4 — pending chains visible when Pending filter selected
// ---------------------------------------------------------------------------

// @blurb The Pending filter restricts the chain list to chains where no tasks have started,
// @blurb giving users a focused view of unbegun work.
test('4: pending chains appear when Pending filter is selected', async ({ page }) => {
  await page.goto('/tasks/chains')

  await page.getByTestId('chain-status-filter').selectOption('pending')

  await expect(page.locator('[data-testid="chain-item"]')).toHaveCount(1)
  await expect(page.locator('[data-chain-slug="work-port-planning"]')).toBeVisible()
  await expect(page.locator('[data-chain-slug="work-port-tier2-reads"]')).not.toBeVisible()
})

// ---------------------------------------------------------------------------
// Journey 5 — task list loads when clicking a pending chain
// ---------------------------------------------------------------------------

// @blurb Chain selection and task table loading work correctly even for chains with no active
// @blurb or closed tasks — the interaction is not gated on chain progress.
test('5: task list loads when clicking a pending chain', async ({ page }) => {
  await page.goto('/tasks/chains')

  await page.getByTestId('chain-status-filter').selectOption('pending')
  await page.locator('[data-chain-slug="work-port-planning"]').click()

  const rows = page.locator('[data-testid="task-row"]')
  await expect(rows).toHaveCount(3)
  await expect(rows.first()).toContainText('scope-planning-tools')
  await expect(rows.first().locator('[data-status]')).toHaveAttribute('data-status', 'pending')
})

// ---------------------------------------------------------------------------
// Journey 6 — closed chains visible when Closed filter selected
// ---------------------------------------------------------------------------

// @blurb The Closed filter shows chains in terminal status, letting users review completed or
// @blurb retired work alongside active chains when needed.
test('6: closed chains appear when Closed filter is selected', async ({ page }) => {
  await page.goto('/tasks/chains')

  await page.getByTestId('chain-status-filter').selectOption('closed')

  await expect(page.locator('[data-testid="chain-item"]')).toHaveCount(2)
  await expect(page.locator('[data-chain-slug="mcp-servers-migration"]')).toBeVisible()
  await expect(page.locator('[data-chain-slug="establish-conventions"]')).toBeVisible()
  await expect(page.locator('[data-chain-slug="work-port-tier2-reads"]')).not.toBeVisible()
})

// ---------------------------------------------------------------------------
// Journey 7 — task list loads when clicking a closed chain
// ---------------------------------------------------------------------------

// @blurb Chain selection works for closed chains, displaying their historical task list with
// @blurb closed and cancelled statuses intact.
test('7: task list loads when clicking a closed chain', async ({ page }) => {
  await page.goto('/tasks/chains')

  await page.getByTestId('chain-status-filter').selectOption('closed')
  await page.locator('[data-chain-slug="mcp-servers-migration"]').click()

  const rows = page.locator('[data-testid="task-row"]')
  await expect(rows).toHaveCount(3)
  await expect(rows.first()).toContainText('classify-tool-surface')
  await expect(rows.first().locator('[data-status]')).toHaveAttribute('data-status', 'closed')
})

// ---------------------------------------------------------------------------
// Journey 8 — all chains visible when All filter selected
// ---------------------------------------------------------------------------

// @blurb The All filter disables status filtering entirely, showing every chain regardless of
// @blurb its current lifecycle state.
test('8: all chains appear when All filter is selected', async ({ page }) => {
  await page.goto('/tasks/chains')

  await page.getByTestId('chain-status-filter').selectOption('all')

  await expect(page.locator('[data-testid="chain-item"]')).toHaveCount(5)
})

// ---------------------------------------------------------------------------
// Journey 9 — Updated ↓ / ↑ sort order
// ---------------------------------------------------------------------------

// @blurb Updated ↓/↑ sort modes order chains by their most recent activity — descending
// @blurb surfaces active work, ascending surfaces chains that haven't moved in a while.
test('9: updated sort orders chains by last-updated timestamp', async ({ page }) => {
  await page.goto('/tasks/chains')

  await page.getByTestId('chain-status-filter').selectOption('all')

  // Default is updated-desc: tier2(Apr25) nav(Apr24) planning(Apr23) migration(Apr20) conventions(Apr18)
  await page.getByTestId('chain-sort-select').selectOption('updated-desc')
  expect(await visibleChainSlugs(page)).toEqual([
    'work-port-tier2-reads',
    'work-port-nav-validation',
    'work-port-planning',
    'mcp-servers-migration',
    'establish-conventions',
  ])

  // Reversed
  await page.getByTestId('chain-sort-select').selectOption('updated-asc')
  expect(await visibleChainSlugs(page)).toEqual([
    'establish-conventions',
    'mcp-servers-migration',
    'work-port-planning',
    'work-port-nav-validation',
    'work-port-tier2-reads',
  ])
})

// ---------------------------------------------------------------------------
// Journey 10 — Slug A→Z / Z→A sort order
// ---------------------------------------------------------------------------

// @blurb Slug A→Z / Z→A sort gives a deterministic alphabetical ordering useful for locating
// @blurb a specific chain by name without knowing its recency.
test('10: slug sort orders chains alphabetically', async ({ page }) => {
  await page.goto('/tasks/chains')

  await page.getByTestId('chain-status-filter').selectOption('all')

  await page.getByTestId('chain-sort-select').selectOption('slug-asc')
  expect(await visibleChainSlugs(page)).toEqual([
    'establish-conventions',
    'mcp-servers-migration',
    'work-port-nav-validation',
    'work-port-planning',
    'work-port-tier2-reads',
  ])

  await page.getByTestId('chain-sort-select').selectOption('slug-desc')
  expect(await visibleChainSlugs(page)).toEqual([
    'work-port-tier2-reads',
    'work-port-planning',
    'work-port-nav-validation',
    'mcp-servers-migration',
    'establish-conventions',
  ])
})

// ---------------------------------------------------------------------------
// Journey 11 — toggle between Task and Chain view
// ---------------------------------------------------------------------------

// @blurb The right panel toggle persists the selected mode and flips between task detail and
// @blurb chain metadata without re-fetching data from the server.
test('11: Task/Chain toggle flips correctly after selecting a chain then a task', async ({ page }) => {
  await page.goto('/tasks/chains')

  // Click a chain — auto-switches right panel to Chain mode
  await page.locator('[data-chain-slug="work-port-tier2-reads"]').click()
  await expect(page.locator('[data-testid="task-row"]').first()).toBeVisible()
  await expect(page.getByTestId('right-panel-toggle-chain')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('right-panel-toggle-task')).toHaveAttribute('aria-pressed', 'false')

  // Click a task — flips to Task mode and shows the selected task slug
  await page.locator('[data-testid="task-row"]').first().click()
  await expect(page.getByTestId('right-panel-toggle-task')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('right-panel-toggle-chain')).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByTestId('task-detail-slug')).toBeVisible()

  // Click Chain toggle — returns to chain detail
  await page.getByTestId('right-panel-toggle-chain').click()
  await expect(page.getByTestId('right-panel-toggle-chain')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('All four Tier 2 tools ported')).toBeVisible()
})

// ---------------------------------------------------------------------------
// Journey 12 — changing filter or sort clears selection
// ---------------------------------------------------------------------------

// @blurb Changing the chain filter or sort resets the selection so the middle and right panels
// @blurb never display stale data from the previous chain.
test('12: changing filter or sort deselects current chain and clears panels', async ({ page }) => {
  await page.goto('/tasks/chains')

  // Select a chain to populate middle and right panels
  await page.locator('[data-chain-slug="work-port-tier2-reads"]').click()
  await expect(page.locator('[data-testid="task-row"]').first()).toBeVisible()

  // Change filter — selection should clear
  await page.getByTestId('chain-status-filter').selectOption('all')
  await expect(page.getByText('Select a chain to see its tasks.')).toBeVisible()
  await expect(page.getByText('Select a chain to see its context.')).toBeVisible()

  // Select again, then change sort — same result
  await page.locator('[data-chain-slug="work-port-tier2-reads"]').click()
  await expect(page.locator('[data-testid="task-row"]').first()).toBeVisible()

  await page.getByTestId('chain-sort-select').selectOption('slug-asc')
  await expect(page.getByText('Select a chain to see its tasks.')).toBeVisible()
})

// ---------------------------------------------------------------------------
// Journey 13 — right panel shows accurate task count strip
// ---------------------------------------------------------------------------

// @blurb The task count strip in the right panel correctly aggregates pending, active, closed,
// @blurb and cancelled tasks from the chain state response.
test('13: right panel count strip shows accurate totals for selected chain', async ({ page }) => {
  await page.goto('/tasks/chains')

  await page.locator('[data-chain-slug="work-port-tier2-reads"]').click()
  await expect(page.locator('[data-testid="task-row"]').first()).toBeVisible()

  const counts = page.getByTestId('chain-task-counts')
  await expect(counts).toContainText('total')
  await expect(counts).toContainText('3')   // total
  await expect(counts).toContainText('pending')
  await expect(counts).toContainText('2')   // 2 pending
  await expect(counts).toContainText('active')
  await expect(counts).toContainText('1')   // 1 active
  await expect(counts).toContainText('closed')
  await expect(counts).toContainText('0')   // 0 closed
})

// ---------------------------------------------------------------------------
// Journey 14 — clicking a chain populates middle task list and right chain prose
// ---------------------------------------------------------------------------

// @blurb Selecting a chain populates both the middle panel (task table) and the right panel
// @blurb (completion condition, design decisions, output prose) in a single interaction.
test('14: clicking a chain shows task list in middle and chain prose in right panel', async ({ page }) => {
  await page.goto('/tasks/chains')

  await page.locator('[data-chain-slug="work-port-tier2-reads"]').click()

  // Middle column: task rows
  await expect(page.locator('[data-testid="task-row"]')).toHaveCount(3)

  // Right column: completion condition prose
  await expect(page.getByText('All four Tier 2 tools ported and pages live.')).toBeVisible()

  // Right column: meta strip with updated date
  await expect(page.getByTestId('chain-meta-strip')).toContainText('Updated 2026-04-25')
})

// ---------------------------------------------------------------------------
// Journey 16 — fuzzy search narrows the chain list via find_chain endpoint
// ---------------------------------------------------------------------------

// @blurb Typing in the chain search box debounces and calls the find_chain endpoint, narrowing
// @blurb the chain list to slugs whose tokens match the query.
test('16: typing in search box calls find_chain and shows ranked results', async ({ page }) => {
  await page.goto('/tasks/chains')

  await page.getByTestId('chain-status-filter').selectOption('all')
  await expect(page.locator('[data-testid="chain-item"]')).toHaveCount(5)

  const findResponse = page.waitForResponse(apiUrlPattern(/\/chains\?/))
  await page.getByTestId('chain-search').fill('nav')
  await findResponse

  await expect(page.locator('[data-testid="chain-item"]')).toHaveCount(1)
  await expect(page.locator('[data-chain-slug="work-port-nav-validation"]')).toBeVisible()
})

// ---------------------------------------------------------------------------
// Journey 17 — search with no matches shows "No chains."
// ---------------------------------------------------------------------------

// @blurb When find_chain returns no results the chain list empties and shows a 'No chains.'
// @blurb placeholder rather than leaving the previous list stale.
test('17: search with no matches shows No chains placeholder', async ({ page }) => {
  await page.goto('/tasks/chains')

  const findResponse = page.waitForResponse(apiUrlPattern(/\/chains\?/))
  await page.getByTestId('chain-search').fill('xxxxxnotachain')
  await findResponse

  await expect(page.getByText('No chains.')).toBeVisible()
  await expect(page.locator('[data-testid="chain-item"]')).toHaveCount(0)
})

// ---------------------------------------------------------------------------
// Journey 18 — "X of Y chains" header count reflects filter + search
// ---------------------------------------------------------------------------

// @blurb The 'N of M chains' label reflects both the active status filter and the fuzzy
// @blurb search simultaneously so the user always knows how many chains are visible.
test('18: chain count header updates with filter and search changes', async ({ page }) => {
  await page.goto('/tasks/chains')

  // Default in-progress: 2 visible of 5 total
  await expect(page.getByTestId('chain-count')).toContainText('2 of 5 chains')

  // All filter: 5 of 5
  await page.getByTestId('chain-status-filter').selectOption('all')
  await expect(page.getByTestId('chain-count')).toContainText('5 of 5 chains')

  // Fuzzy search narrows: 'tier2' → 1 match of 5 total
  const findResponse = page.waitForResponse(apiUrlPattern(/\/chains\?/))
  await page.getByTestId('chain-search').fill('tier2')
  await findResponse
  await expect(page.getByTestId('chain-count')).toContainText('1 of 5 chains')

  // Clear search: find inactive, fall back to All filter → 5 of 5
  await page.getByTestId('chain-search').fill('')
  await expect(page.getByTestId('chain-count')).toContainText('5 of 5 chains')
})

// ---------------------------------------------------------------------------
// Journey 19 — Refresh button re-fetches chain list
// ---------------------------------------------------------------------------

// @blurb The Refresh button triggers a new /chains/status fetch, allowing users to pick up
// @blurb changes since the page loaded without a full page reload.
test('19: clicking Refresh re-fetches the chain list', async ({ page }) => {
  let callCount = 0
  await page.route(apiUrlPattern(/\/chains(\?|$)/), route => {
    callCount++
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(CHAINS),
    })
  })

  await page.goto('/tasks/chains')
  await expect(page.locator('[data-testid="chain-item"]')).toHaveCount(2)
  const countAfterLoad = callCount

  await page.getByRole('button', { name: 'Refresh' }).click()
  await expect.poll(() => callCount).toBe(countAfterLoad + 1)
})

// ---------------------------------------------------------------------------
// Journey 20 — chain summary header shows aggregate counts from endpoint data
// ---------------------------------------------------------------------------
// CHAINS fixture: 5 chains total, 3 open (work-port-tier2-reads, work-port-nav-validation,
// work-port-planning), 2 closed (mcp-servers-migration, establish-conventions).
// tasks_closed: 0 + 2 + 0 + 3 + 2 = 7, tasks_total: 3 + 3 + 3 + 3 + 3 = 15.

// @blurb The summary bar aggregates all chain data — total chains, open vs closed count, and
// @blurb overall task completion fraction — from the live endpoint response.
test('20: chain summary header renders aggregate chain counts from endpoint data', async ({ page }) => {
  await page.goto('/tasks/chains')

  const header = page.getByTestId('chain-summary-header')
  await expect(header).toBeVisible()

  await expect(page.getByTestId('summary-total')).toContainText('5')
  await expect(page.getByTestId('summary-open')).toContainText('3')
  await expect(page.getByTestId('summary-closed')).toContainText('2')
  // tasks_closed total: 0+2+0+3+2=7; tasks_total: 3+3+3+3+3=15
  await expect(page.getByTestId('summary-tasks-closed')).toContainText('7')
  await expect(page.getByTestId('summary-tasks-closed')).toContainText('15')
})

// ---------------------------------------------------------------------------
// Journey 21 — find_chain search: ranked results, clear resets to full list
// ---------------------------------------------------------------------------

// @blurb The chain search operates as a further filter on top of the status filter and sort;
// @blurb clearing the query restores the full filtered+sorted list without a page reload.
test('21: fuzzy search narrows within the active filter+sort — clearing resets to full filtered list', async ({ page }) => {
  await page.goto('/tasks/chains')

  // Switch to All + slug-asc so order is deterministic
  await page.getByTestId('chain-status-filter').selectOption('all')
  await page.getByTestId('chain-sort-select').selectOption('slug-asc')
  await expect(page.locator('[data-testid="chain-item"]')).toHaveCount(5)

  // Type a query — narrows within the current filtered+sorted set
  const findResponse = page.waitForResponse(apiUrlPattern(/\/chains\?/))
  await page.getByTestId('chain-search').fill('work port')
  await findResponse

  // Only the three 'work-port-*' chains match; sort order (slug-asc) is preserved
  const items = page.locator('[data-testid="chain-item"]')
  await expect(items).toHaveCount(3)
  await expect(items.first()).toHaveAttribute('data-chain-slug', 'work-port-nav-validation')
  await expect(items.nth(1)).toHaveAttribute('data-chain-slug', 'work-port-planning')
  await expect(items.nth(2)).toHaveAttribute('data-chain-slug', 'work-port-tier2-reads')

  // Clear the search — reverts to all 5 chains in slug-asc order
  await page.getByTestId('chain-search').fill('')
  await expect(page.locator('[data-testid="chain-item"]')).toHaveCount(5)
})

// ---------------------------------------------------------------------------
// Journey 22 — task content search: query shows results, field labeled, excerpt
// renders, clearing resets to task table
// ---------------------------------------------------------------------------

// @blurb Task content search returns matches with field labels and highlighted excerpts;
// @blurb clearing the query restores the chain task table and removes the search results.
test('22: task content search shows results with field label and excerpt, clearing resets', async ({ page }) => {
  await page.goto('/tasks/chains')

  // Type a query in the task content search box — triggers /tasks/search
  const searchResponse = page.waitForResponse(/\/tasks\/search/)
  await page.getByTestId('task-content-search').fill('port')
  await searchResponse

  // Results list appears
  const results = page.locator('[data-testid="content-search-result"]')
  await expect(results).toHaveCount(2)

  // First result: task slug, chain slug, field label, snippet
  const first = results.first()
  await expect(first.locator('[data-testid="search-result-task-slug"]')).toContainText('port-get-chain-state')
  await expect(first.locator('[data-testid="search-result-chain-slug"]')).toContainText('work-port-tier2-reads')
  await expect(first.locator('[data-testid="search-result-field"]')).toContainText('problem_statement')
  await expect(first.locator('[data-testid="search-result-snippet"]')).toBeVisible()

  // Excerpt contains highlighted text (<mark> element)
  await expect(first.locator('mark')).toBeVisible()

  // Clear the query — results disappear, task table placeholder reappears
  await page.getByTestId('task-content-search').fill('')
  await expect(page.locator('[data-testid="content-search-result"]')).toHaveCount(0)
  await expect(page.getByText('Select a chain to see its tasks.')).toBeVisible()
})

// ---------------------------------------------------------------------------
// Journey 23 — Chains / Tasks / Details column labels are always visible
// ---------------------------------------------------------------------------

// @blurb Column labels rendered via Panel title props remain visible regardless of selection
// @blurb state, orienting the user to each column's purpose at all times.
test('23: Chains/Tasks/Details column labels are always visible', async ({ page }) => {
  await page.goto('/tasks/chains')

  const titles = page.locator('[data-testid="panel-title"]')
  await expect(titles).toHaveCount(3)
  await expect(titles.nth(0)).toHaveText('Chains')
  await expect(titles.nth(1)).toHaveText('Tasks')
  await expect(titles.nth(2)).toHaveText('Details')
})

// ---------------------------------------------------------------------------
// Journey 24 — task search sends chain_slug when a chain is selected
// ---------------------------------------------------------------------------

// @blurb When a chain is selected, task content search appends chain_slug to scope results
// @blurb to that chain's tasks only, rather than searching across all chains.
test('24: task search includes chain_slug param when a chain is selected', async ({ page }) => {
  await page.goto('/tasks/chains')

  await page.locator('[data-chain-slug="work-port-tier2-reads"]').click()
  await expect(page.locator('[data-testid="task-row"]').first()).toBeVisible()

  const searchRequest = page.waitForRequest(r => r.url().includes('/tasks/search'))
  await page.getByTestId('task-content-search').fill('port')
  const req = await searchRequest

  const url = new URL(req.url())
  expect(url.searchParams.get('chain_slug')).toBe('work-port-tier2-reads')
})

// ---------------------------------------------------------------------------
// Journey 25 — task search sends chain_status=open when in-progress filter active
// and no chain is selected
// ---------------------------------------------------------------------------

// @blurb Without a selected chain, task search respects the status filter by mapping it to
// @blurb a chain_status parameter so unrelated chains don't pollute results.
test('25: task search sends chain_status=open when in-progress filter is active and no chain selected', async ({ page }) => {
  await page.goto('/tasks/chains')

  // Default filter is in-progress; no chain selected
  const searchRequest = page.waitForRequest(r => r.url().includes('/tasks/search'))
  await page.getByTestId('task-content-search').fill('port')
  const req = await searchRequest

  const url = new URL(req.url())
  expect(url.searchParams.get('chain_status')).toBe('open')
  expect(url.searchParams.get('chain_slug')).toBeNull()
})

// ---------------------------------------------------------------------------
// Journey 26 — clicking a task search result selects parent chain, highlights
// task row, switches right panel to task mode, keeps search query
// ---------------------------------------------------------------------------

// @blurb Clicking a task content search result selects the parent chain, records the task in
// @blurb the right panel, and preserves the search query for continued browsing.
test('26: clicking task search result selects parent chain, highlights task, keeps query', async ({ page }) => {
  await page.goto('/tasks/chains')

  await page.getByTestId('chain-status-filter').selectOption('all')

  const searchResponse = page.waitForResponse(/\/tasks\/search/)
  await page.getByTestId('task-content-search').fill('port')
  await searchResponse

  const firstResult = page.locator('[data-testid="content-search-result"]').first()
  await expect(firstResult).toBeVisible()

  const chainSlug = await firstResult.locator('[data-testid="search-result-chain-slug"]').textContent()
  const taskSlug  = await firstResult.locator('[data-testid="search-result-task-slug"]').textContent()

  await firstResult.click()

  // Chain item is selected
  await expect(page.locator(`[data-chain-slug="${chainSlug}"]`)).toHaveAttribute('aria-selected', 'true')

  // Right panel is in task mode and shows the task detail
  await expect(page.getByTestId('right-panel-toggle-task')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('task-detail-slug')).toHaveText(String(taskSlug))

  // Content search results are still showing (search query was not cleared)
  await expect(page.locator('[data-testid="content-search-result"]').first()).toBeVisible()
  await expect(page.getByTestId('task-content-search')).toHaveValue('port')
})

// ---------------------------------------------------------------------------
// Journey 28 — refresh updates task status badge after task is closed externally
// ---------------------------------------------------------------------------

// @blurb After an agent closes a task externally, the Refresh button re-fetches the chain
// @blurb state and updates the status badge from Active to Closed without a page reload.
test('28: refresh re-fetches chain state and updates task status badge', async ({ page }) => {
  // First /tasks?chain_slug=work-port-tier2-reads call: port-get-chain-state
  // is active. Second call (after refresh): same task is now closed.
  let chainStateCallCount = 0
  await page.route(apiUrlPattern(/\/tasks(\?|$)/), async route => {
    const url = new URL(route.request().url())
    if (url.searchParams.get('chain_slug') !== 'work-port-tier2-reads') {
      return route.continue()
    }
    chainStateCallCount++
    const taskStatus = chainStateCallCount === 1 ? 'active' : 'closed'
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 1, chain_id: 1, chain_slug: 'work-port-tier2-reads',
          project_id: 'mcp-servers',
          slug: 'port-get-chain-state',
          position: 1, status: taskStatus,
          problem_statement: 'Port get_chain_state to work-server end-to-end.',
          updated_at: '2026-04-25T01:00:00Z',
        },
        {
          id: 2, chain_id: 1, chain_slug: 'work-port-tier2-reads',
          project_id: 'mcp-servers',
          slug: 'view-get-chain-state',
          position: 2, status: 'pending',
          problem_statement: 'Build the task/chain index page.',
          updated_at: '2026-04-25T01:00:00Z',
        },
        {
          id: 3, chain_id: 1, chain_slug: 'work-port-tier2-reads',
          project_id: 'mcp-servers',
          slug: 'port-chain-status',
          position: 3, status: 'pending',
          problem_statement: 'Port chain_status to work-server.',
          updated_at: '2026-04-25T01:00:00Z',
        },
      ]),
    })
  })

  await page.goto('/tasks/chains')
  await page.locator('[data-chain-slug="work-port-tier2-reads"]').click()

  // First load: task row shows Active badge
  const targetRow = page.locator('[data-task-slug="port-get-chain-state"]')
  await expect(targetRow).toBeVisible()
  await expect(targetRow.locator('[data-testid="status-badge"]')).toHaveAttribute('data-status', 'active')

  // Click Refresh — triggers a second /chains/state fetch with closed status
  const stateRefetch = page.waitForResponse(apiUrlPattern(/\/tasks\?/))
  await page.getByRole('button', { name: 'Refresh' }).click()
  await stateRefetch

  // Badge has updated to Closed
  await expect(targetRow.locator('[data-testid="status-badge"]')).toHaveAttribute('data-status', 'closed')
})

// ---------------------------------------------------------------------------
// Journey 27 — ?chain=&task= URL params pre-select chain and highlight task row
// ---------------------------------------------------------------------------

// @blurb Navigating with ?chain=X&task=Y restores a specific task selection on mount,
// @blurb enabling deep-linking from the Work Search page's 'Go to planning dash' button.
test('27: ?chain=&task= URL params pre-select the chain and highlight the task row', async ({ page }) => {
  await page.goto('/tasks/chains?chain=work-port-tier2-reads&task=port-get-chain-state')

  // Chain item is selected
  await expect(
    page.locator('[data-chain-slug="work-port-tier2-reads"]'),
  ).toHaveAttribute('aria-selected', 'true')

  // Task table loads and the target row is highlighted
  await expect(page.locator('[data-testid="task-row"]').first()).toBeVisible()
  await expect(
    page.locator('[data-task-slug="port-get-chain-state"]'),
  ).toHaveAttribute('aria-selected', 'true')

  // Right panel starts in task mode and shows the task detail
  await expect(page.getByTestId('right-panel-toggle-task')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('task-detail-slug')).toContainText('port-get-chain-state')
})
