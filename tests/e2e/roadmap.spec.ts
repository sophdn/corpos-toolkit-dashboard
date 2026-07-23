import { expect, test } from '@playwright/test'
import { apiRoute } from './lib/api-route'

// ---------------------------------------------------------------------------
// Mock data — one chain row, one task row, one diff entry of each shape.
// ---------------------------------------------------------------------------

const ROADMAP = [
  {
    position: 1,
    ref_kind: 'chain',
    ref_slug: 'network-and-setup-recipes',
    chain_slug: null,
    note: 'priority 1',
    status: 'open',
    updated_at: '2026-05-05',
  },
  {
    position: 2,
    ref_kind: 'task',
    ref_slug: 'transport-lib-crate',
    chain_slug: 'network-and-setup-recipes',
    note: null,
    status: 'pending',
    updated_at: '2026-05-05',
  },
]

const ROADMAP_DIFF = {
  chains: [
    {
      slug: 'forged-after-reassessment',
      project_id: 'seed-packet',
      created_at: '2026-05-05',
      chain_slug: null,
    },
  ],
  tasks: [
    {
      slug: 'forged-task-after',
      project_id: 'mcp-servers',
      created_at: '2026-05-05',
      chain_slug: 'parent-chain',
    },
  ],
}

// /chains response for the ChainIndex page that the link navigates to.
const CHAINS = [
  {
    id: 1,
    project_id: 'seed-packet',
    slug: 'network-and-setup-recipes',
    status: 'open',
    total_tasks: 12,
    pending: 11,
    active: 0,
    blocked: 1,
    closed: 0,
    cancelled: 0,
    updated_at: '2026-05-05',
  },
]

const TASKS_FOR_CHAIN = [
  {
    id: 10,
    chain_id: 1,
    chain_slug: 'network-and-setup-recipes',
    project_id: 'seed-packet',
    slug: 'transport-lib-crate',
    position: 2,
    status: 'pending',
    problem_statement: 'New crates/transport-lib/...',
    created_at: '2026-05-05',
    updated_at: '2026-05-05',
  },
]

// ---------------------------------------------------------------------------
// Setup — mock all observe-http endpoints used across the journey.
// ---------------------------------------------------------------------------

// All mocks go through `apiRoute()` (tests/e2e/lib/api-route.ts) so
// they pin to the API host (port 3001) and don't intercept SPA
// navigation under the Vite dev server (port 5180). `/roadmap` is both
// an SPA route and an API path; an unscoped route would fulfill the
// navigation with JSON instead of HTML.

test.beforeEach(async ({ page }) => {
  await apiRoute(page, /\/roadmap\/diff$/, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ROADMAP_DIFF),
    }),
  )
  await apiRoute(page, '/roadmap', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ROADMAP),
    }),
  )
  await apiRoute(page, '/chains', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(CHAINS),
    }),
  )
  await apiRoute(page, '/tasks', async route => {
    const url = new URL(route.request().url())
    const slug = url.searchParams.get('chain_slug') ?? ''
    const tasks = slug === 'network-and-setup-recipes' ? TASKS_FOR_CHAIN : []
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(tasks),
    })
  })
  // Anything else the dashboard might fetch incidentally — return empty.
  await apiRoute(
    page,
    /\/(bugs|emotive|tool-health|projects|benchmarks)(\?.*)?$/,
    route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '[]',
      }),
  )
})

// ---------------------------------------------------------------------------
// Journey 1 — page renders ordered backlog with slug links
// ---------------------------------------------------------------------------

// @blurb /roadmap renders ordered backlog rows whose slug + chain columns are
// @blurb hyperlinks pointing at /tasks/chains with the right query parameters.
test('1: ordered-backlog slugs render as deep-links into /tasks/chains', async ({ page }) => {
  await page.goto('/roadmap')
  await expect(page.getByTestId('roadmap-page')).toBeVisible()

  const links = page.getByTestId('roadmap-row-slug-link')
  await expect(links).toHaveCount(2)
  await expect(links.nth(0)).toHaveAttribute(
    'href',
    '/tasks/chains?chain=network-and-setup-recipes',
  )
  await expect(links.nth(1)).toHaveAttribute(
    'href',
    '/tasks/chains?chain=network-and-setup-recipes&task=transport-lib-crate',
  )

  // Task row's Chain column also links back to the parent chain.
  await expect(page.getByTestId('roadmap-row-chain-link')).toHaveAttribute(
    'href',
    '/tasks/chains?chain=network-and-setup-recipes',
  )
})

// ---------------------------------------------------------------------------
// Journey 2 — diff slugs link too
// ---------------------------------------------------------------------------

// @blurb 'Unplaced since last reassessment' chain and task entries are also
// @blurb hyperlinked into the chains-and-tasks page.
test('2: diff slugs render as deep-links into /tasks/chains', async ({ page }) => {
  await page.goto('/roadmap')
  await expect(page.getByTestId('roadmap-diff-chain-link')).toHaveAttribute(
    'href',
    '/tasks/chains?chain=forged-after-reassessment',
  )
  await expect(page.getByTestId('roadmap-diff-task-link')).toHaveAttribute(
    'href',
    '/tasks/chains?chain=parent-chain&task=forged-task-after',
  )
})

// ---------------------------------------------------------------------------
// Journey 3 — clicking the chain slug navigates and selects the chain
// ---------------------------------------------------------------------------

// @blurb Clicking a chain slug on /roadmap takes the user to /tasks/chains with
// @blurb the chain pre-selected (?chain= in the URL); the chain index page reads
// @blurb the query param and surfaces that chain's tasks.
test('3: clicking a chain slug navigates to /tasks/chains with the chain selected', async ({ page }) => {
  await page.goto('/roadmap')
  await page.getByTestId('roadmap-row-slug-link').first().click()

  await expect(page).toHaveURL(/\/tasks\/chains\?chain=network-and-setup-recipes$/)
  // ChainIndex reads ?chain= as initial selection and renders the
  // right-pane detail body (tasks + counts) for the selected chain.
  // (The chain-list row may be hidden by the default 'in-progress'
  // status filter, so we assert on the detail panel instead.)
  await expect(page.getByTestId('chain-task-counts')).toBeVisible()
})

// ---------------------------------------------------------------------------
// Journey 4 — clicking a task slug navigates with both chain and task selected
// ---------------------------------------------------------------------------

// @blurb Clicking a task slug on /roadmap takes the user to /tasks/chains with
// @blurb both chain and task pre-selected (?chain=...&task=... in the URL).
test('4: clicking a task slug navigates with both chain and task pre-selected', async ({ page }) => {
  await page.goto('/roadmap')
  await page.getByTestId('roadmap-row-slug-link').nth(1).click()

  await expect(page).toHaveURL(
    /\/tasks\/chains\?chain=network-and-setup-recipes&task=transport-lib-crate$/,
  )
  // Chain selected → middle pane lists tasks for the chosen chain.
  // The right pane is in 'task' mode (driven by ?task=), so chain-task-
  // counts isn't rendered here; assert the task row is in the table.
  const taskRow = page.getByTestId('task-row').filter({ hasText: 'transport-lib-crate' })
  await expect(taskRow).toBeVisible()
})
