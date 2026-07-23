import { expect, test } from '@playwright/test'
import { apiUrlPattern } from './lib/api-route'

// File-level skip: this spec exercises a page that has been moved to
// src/pages/_dormant/. The page is no longer routed and the assertions
// fail with 404 / locator-not-found. Restore the page (move out of
// _dormant/ + register a route) before re-enabling. Filed as bug
// dashboard-playwright-tests-not-in-ci-quietly-rotted-since-cd5d3cf
// and its T16 follow-up.
test.skip()

// ---------------------------------------------------------------------------
// Fixture data — covers all three layer shapes for two tools so the page
// renders the per-tool grouping and the layer-specific render paths.
// ---------------------------------------------------------------------------

const SCENARIOS_RESPONSE = {
  scenarios: [
    {
      layer: 'l4', id: 'l4-bl-status-open', tool_name: 'bug_list',
      user_prompt: 'Show me all currently open bugs.',
      expected_args: [{ name: 'status', kind: 'exact', value: 'open' }],
    },
    {
      layer: 'l5', id: 'l5-bl-open-count', tool_name: 'bug_list',
      tool_output: '[{"slug":"foo","status":"open"}]',
      question: 'How many bugs are listed?',
      expected_answer: '1',
    },
    {
      layer: 'l6', id: 'l6-bl-route-to-resolution-mix', tool_name: 'bug_list',
      user_prompt: 'I want aggregate counts of fixed vs open vs wontfix.',
      expected_decision: { kind: 'route_to', route_to: 'bug_resolution_mix' },
    },
    {
      layer: 'l4', id: 'l4-ping-healthcheck', tool_name: 'ping',
      user_prompt: 'Check that the MCP server is alive.',
      expected_args: [],
    },
    {
      layer: 'l6', id: 'l6-ping-no-tool', tool_name: 'ping',
      user_prompt: 'Hi, good morning! How are you?',
      expected_decision: { kind: 'no_tool', route_to: null },
    },
  ],
}

test.beforeEach(async ({ page }) => {
  await page.route(apiUrlPattern(/\/scenarios/), async route => {
    const url = new URL(route.request().url())
    const layer = url.searchParams.get('layer')
    const tool  = url.searchParams.get('tool')
    let entries = SCENARIOS_RESPONSE.scenarios
    if (layer) entries = entries.filter(e => e.layer === layer)
    if (tool)  entries = entries.filter(e => e.tool_name === tool)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ scenarios: entries }),
    })
  })
})

// ---------------------------------------------------------------------------
// Journey 1 — page loads and groups scenarios by tool
// ---------------------------------------------------------------------------

// @blurb Navigating to /scenarios fetches the corpus and renders one
// @blurb tool-group section per distinct tool, sorted alphabetically.
test('1: page loads and groups scenarios by tool', async ({ page }) => {
  await page.goto('/scenarios')

  await expect(page.getByTestId('scenarios-results')).toBeVisible()
  const groups = await page.getByTestId('scenarios-tool-group').all()
  expect(groups.length).toBe(2)
  // Alphabetical order: bug_list before ping.
  expect(await groups[0].getAttribute('data-tool')).toBe('bug_list')
  expect(await groups[1].getAttribute('data-tool')).toBe('ping')
})

// ---------------------------------------------------------------------------
// Journey 2 — layer toggle filters entries
// ---------------------------------------------------------------------------

// @blurb Clicking a layer toggle (e.g. L5) refetches with ?layer=l5 and
// @blurb the rendered entries reflect that filter.
test('2: layer toggle narrows to one layer', async ({ page }) => {
  await page.goto('/scenarios')
  await expect(page.getByTestId('scenarios-results')).toBeVisible()

  // 5 entries unfiltered.
  await expect(page.getByTestId('scenarios-entry')).toHaveCount(5)

  await page.locator('[data-testid="scenarios-layer-toggle"][data-layer="l5"]').click()

  // Only the L5 entry remains.
  await expect(page.getByTestId('scenarios-entry')).toHaveCount(1)
  await expect(page.locator('[data-testid="scenarios-entry"]').first()).toHaveAttribute('data-layer', 'l5')
})

// ---------------------------------------------------------------------------
// Journey 3 — tool dropdown filters entries
// ---------------------------------------------------------------------------

// @blurb Selecting a specific tool from the dropdown refetches with ?tool=
// @blurb and the rendered entries reflect the cross-layer set for that tool.
test('3: tool dropdown narrows to one tool', async ({ page }) => {
  await page.goto('/scenarios')
  await expect(page.getByTestId('scenarios-results')).toBeVisible()

  await page.getByTestId('scenarios-tool-select').selectOption('ping')

  // ping has 2 entries (1 L4 + 1 L6).
  await expect(page.getByTestId('scenarios-entry')).toHaveCount(2)
  for (const entry of await page.getByTestId('scenarios-entry').all()) {
    expect(await entry.getAttribute('data-tool')).toBe('ping')
  }
})

// ---------------------------------------------------------------------------
// Journey 4 — free-text search filters client-side
// ---------------------------------------------------------------------------

// @blurb Typing in the search box filters entries client-side without
// @blurb refetching (corpus is small enough to filter in memory). Clearing
// @blurb the search restores every entry.
test('4: free-text search filters entries', async ({ page }) => {
  await page.goto('/scenarios')
  await expect(page.getByTestId('scenarios-results')).toBeVisible()

  const search = page.getByTestId('scenarios-search')
  await search.fill('aggregate counts')

  // Only the L6 bug_list RouteTo scenario matches that prompt phrase.
  await expect(page.getByTestId('scenarios-entry')).toHaveCount(1)
  await expect(page.locator('[data-testid="scenarios-entry"]').first()).toHaveAttribute('data-id', 'l6-bl-route-to-resolution-mix')

  await search.fill('')
  await expect(page.getByTestId('scenarios-entry')).toHaveCount(5)
})

// ---------------------------------------------------------------------------
// Journey 5 — URL params deep-link to a filtered view
// ---------------------------------------------------------------------------

// @blurb Loading the page with ?layer=l5&tool=bug_list initialises the
// @blurb filter state from URL params, refetches with those params, and
// @blurb renders the matching entries — bookmarkable views.
test('5: URL params deep-link initialises filters', async ({ page }) => {
  await page.goto('/scenarios?layer=l5&tool=bug_list')
  await expect(page.getByTestId('scenarios-results')).toBeVisible()

  // Layer toggle reflects the URL state.
  await expect(page.locator('[data-testid="scenarios-layer-toggle"][data-layer="l5"]')).toHaveAttribute('aria-pressed', 'true')
  // Tool dropdown reflects the URL state.
  await expect(page.getByTestId('scenarios-tool-select')).toHaveValue('bug_list')

  // Only the L5 bug_list entry rendered.
  await expect(page.getByTestId('scenarios-entry')).toHaveCount(1)
  await expect(page.locator('[data-testid="scenarios-entry"]').first()).toHaveAttribute('data-id', 'l5-bl-open-count')
})

// ---------------------------------------------------------------------------
// Journey 6 — L5 tool_output renders in a pre block
// ---------------------------------------------------------------------------

// @blurb L5 entries render their tool_output in a monospace <pre> via the
// @blurb scenarios-tool-output testid; the synthetic JSON shows up verbatim.
test('6: L5 entries render tool_output in a pre block', async ({ page }) => {
  await page.goto('/scenarios?layer=l5')
  await expect(page.getByTestId('scenarios-results')).toBeVisible()

  const output = page.getByTestId('scenarios-tool-output').first()
  await expect(output).toBeVisible()
  await expect(output).toHaveText('[{"slug":"foo","status":"open"}]')
})

// ---------------------------------------------------------------------------
// Journey 7 — L6 entries render the decision badge with kind
// ---------------------------------------------------------------------------

// @blurb L6 entries render an expected_decision badge with data-kind set
// @blurb to no_tool / ask_for_clarification / route_to so reviewers can
// @blurb visually scan the decision distribution.
test('7: L6 entries render the decision badge with data-kind', async ({ page }) => {
  await page.goto('/scenarios?layer=l6')
  await expect(page.getByTestId('scenarios-results')).toBeVisible()

  const badges = await page.getByTestId('scenarios-decision-badge').all()
  expect(badges.length).toBe(2)
  const kinds = await Promise.all(badges.map(b => b.getAttribute('data-kind')))
  expect(kinds.sort()).toEqual(['no_tool', 'route_to'])
})

// ---------------------------------------------------------------------------
// Journey 8 — empty result renders the empty state
// ---------------------------------------------------------------------------

// @blurb When filters narrow to an empty set, the page renders the
// @blurb scenarios-empty state rather than a blank results area.
test('8: empty filter result renders the empty state', async ({ page }) => {
  await page.goto('/scenarios')
  await expect(page.getByTestId('scenarios-results')).toBeVisible()

  await page.getByTestId('scenarios-search').fill('definitely-no-such-thing-anywhere')

  await expect(page.getByTestId('scenarios-empty')).toBeVisible()
  await expect(page.getByTestId('scenarios-entry')).toHaveCount(0)
})

// ---------------------------------------------------------------------------
// Journey 9 — Scenarios sidebar link navigates to /scenarios
// ---------------------------------------------------------------------------

// @blurb The Scenarios sidebar link routes to /scenarios and becomes the
// @blurb active link when the user lands there.
test('9: Scenarios sidebar link navigates to /scenarios', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Scenarios' }).click()
  await expect(page).toHaveURL(/\/scenarios/)

  const link = page.getByRole('link', { name: 'Scenarios' })
  await expect(link).toHaveClass(/active/i)
})
