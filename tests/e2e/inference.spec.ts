import { expect, test } from '@playwright/test'
import { apiUrlPattern } from './lib/api-route'

// Playwright e2e spec for the Inference page (chain
// telemetry-substrate-cleanup T3b). Mocks the /inference/health-cards
// and /inference/sparklines endpoints with deterministic fixtures so
// the test asserts page behavior, not server state.

const HOUR_MS = 60 * 60 * 1000

// Synthesise a created_at string in the SQLite "YYYY-MM-DD HH:MM:SS"
// (UTC) shape the server emits. Offset relative to now, so the
// traffic-light tier is deterministic regardless of when the suite runs.
function tsBefore(offsetMs: number): string {
  return new Date(Date.now() - offsetMs).toISOString().replace('T', ' ').slice(0, 19)
}

// Three cards covering: healthy (green tint, all percentiles populated,
// successrate populated), warming-up (yellow tint, p99/success_rate
// null + warming_up flags), and stale-with-bugs (red tint, classify
// predicate, bug join non-zero).
function healthCardsFixture() {
  return [
    {
      task_id: 'classify_x',
      last_call_at: tsBefore(36 * HOUR_MS),
      call_count: 25,
      p50_latency_ms: 100,
      p95_latency_ms: 200,
      p99_latency_ms: null,
      success_rate: 0.8,
      success_rate_basis: 'classify: any accuracy > 0.5',
      bug_count: 2,
      tokens_per_day: 100,
      model_breakdown: [
        { model_name: 'qwen2.5-32b', call_count: 25, p95_latency_ms: 200 },
      ],
      warming_up: { p99: true, success_rate: false, sparklines: false },
    },
    {
      task_id: 'knowledge-search',
      last_call_at: tsBefore(8 * HOUR_MS),
      call_count: 7,
      p50_latency_ms: 1937,
      p95_latency_ms: 5106,
      p99_latency_ms: null,
      success_rate: null,
      success_rate_basis: 'default: row has non-null output_tokens AND non-zero latency',
      bug_count: 0,
      tokens_per_day: 398,
      model_breakdown: [
        { model_name: 'qwen2.5-32b', call_count: 7, p95_latency_ms: 5106 },
      ],
      warming_up: { p99: true, success_rate: true, sparklines: false },
    },
    {
      task_id: 'vault-rerank-retrieve',
      last_call_at: tsBefore(30 * 60 * 1000),
      call_count: 101,
      p50_latency_ms: 7020,
      p95_latency_ms: 10533,
      p99_latency_ms: 13062,
      success_rate: 0.97,
      success_rate_basis: 'vault-rerank-retrieve: matching grounding_events row',
      bug_count: 0,
      tokens_per_day: 14315,
      model_breakdown: [
        { model_name: 'qwen2.5-32b', call_count: 101, p95_latency_ms: 10533 },
      ],
      warming_up: { p99: false, success_rate: false, sparklines: false },
    },
  ]
}

function sparklineFixture(taskID: string) {
  return [
    {
      task_id: taskID,
      buckets: [
        { date: '2026-05-16', call_count: 9, p95_latency_ms: 11743, success_rate: 1, tokens_burned: 41273 },
        { date: '2026-05-17', call_count: 29, p95_latency_ms: 11005, success_rate: 0.9, tokens_burned: 129990 },
        { date: '2026-05-18', call_count: 28, p95_latency_ms: 13062, success_rate: 1, tokens_burned: 117877 },
        { date: '2026-05-19', call_count: 35, p95_latency_ms: 9590, success_rate: 1, tokens_burned: 140338 },
      ],
    },
  ]
}

// retrievalHealthFixture default: empty array so the panel hides
// unless a specific test overrides this route with seeded data. Mirror
// of the server's "degrade-gracefully when projections are empty"
// contract.
function retrievalHealthFixture() {
  return [] as Array<unknown>
}

test.beforeEach(async ({ page }) => {
  await page.route(apiUrlPattern(/\/inference\/health-cards/), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(healthCardsFixture()),
    })
  })
  await page.route(apiUrlPattern(/\/inference\/sparklines/), async (route) => {
    const url = new URL(route.request().url())
    const taskID = url.searchParams.get('task_id') ?? 'vault-rerank-retrieve'
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(sparklineFixture(taskID)),
    })
  })
  await page.route(apiUrlPattern(/\/inference\/retrieval-health/), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(retrievalHealthFixture()),
    })
  })
  await page.route(apiUrlPattern(/\/bugs/), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { slug: 'classify-bug-a', title: 'classify_x flaky on margins', status: 'open', qwen_task_id: 'classify_x' },
        { slug: 'classify-bug-b', title: 'classify_x rubric drift', status: 'open', qwen_task_id: 'classify_x' },
      ]),
    })
  })
})

test.describe('Inference — page renders', () => {
  test('shows heading + window selector + per-task table', async ({ page }) => {
    await page.goto('/inference')
    await expect(page.getByRole('heading', { name: /^Inference$/ })).toBeVisible()
    await expect(page.getByTestId('inference-window')).toBeVisible()
    await expect(page.getByTestId('inference-table')).toBeVisible()
  })

  test('renders one row per task_id from the fixture', async ({ page }) => {
    await page.goto('/inference')
    await expect(page.getByTestId('inference-row-vault-rerank-retrieve')).toBeVisible()
    await expect(page.getByTestId('inference-row-classify_x')).toBeVisible()
    await expect(page.getByTestId('inference-row-knowledge-search')).toBeVisible()
  })

  test('renders the model summary block with per-model row', async ({ page }) => {
    await page.goto('/inference')
    await expect(page.getByTestId('model-summary')).toBeVisible()
    await expect(page.getByTestId('model-summary')).toContainText('qwen2.5-32b')
  })
})

test.describe('Inference — traffic-light tints', () => {
  test('healthy task (30m old) renders green tier', async ({ page }) => {
    await page.goto('/inference')
    const cell = page.getByTestId('stale-vault-rerank-retrieve')
    await expect(cell).toBeVisible()
    const className = await cell.getAttribute('class')
    expect(className).toContain('green')
  })

  test('mid-age task (8h old) renders yellow tier', async ({ page }) => {
    await page.goto('/inference')
    const cell = page.getByTestId('stale-knowledge-search')
    const className = await cell.getAttribute('class')
    expect(className).toContain('yellow')
  })

  test('stale task (36h old) renders red tier', async ({ page }) => {
    await page.goto('/inference')
    const cell = page.getByTestId('stale-classify_x')
    const className = await cell.getAttribute('class')
    expect(className).toContain('red')
  })
})

test.describe('Inference — warming-up state', () => {
  test('p99 + success_rate badges render for under-threshold task', async ({ page }) => {
    await page.goto('/inference')
    // knowledge-search is the warming-up fixture (under both p99 and
    // success_rate floors); both badges appear in its row.
    const row = page.getByTestId('inference-row-knowledge-search')
    await expect(row).toBeVisible()
    await expect(row.getByText(/warming up.*p99/)).toBeVisible()
    await expect(row.getByText(/warming up.*success/)).toBeVisible()
  })

  test('healthy task does NOT render warming-up badges in its row', async ({ page }) => {
    await page.goto('/inference')
    const row = page.getByTestId('inference-row-vault-rerank-retrieve')
    await expect(row).toBeVisible()
    // No warming-up badges in the healthy row itself.
    const badges = row.locator('[data-testid="warming-up-badge"]')
    await expect(badges).toHaveCount(0)
  })
})

test.describe('Inference — retrieval-health panel', () => {
  test('panel hides when retrieval-health is empty (degrade-gracefully)', async ({ page }) => {
    await page.goto('/inference')
    await expect(page.getByTestId('inference-table')).toBeVisible()
    await expect(page.getByTestId('retrieval-health-panel')).toHaveCount(0)
  })

  test('panel renders tiered per-kind cells + weighted score when populated', async ({ page }) => {
    await page.route(apiUrlPattern(/\/inference\/retrieval-health/), async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            action: 'vault_search',
            grounding_count: 20,
            interaction_count: 12,
            by_kind: [
              { click_kind: 'followed', count: 8, rate: 0.4, weight: 1.0 },
              { click_kind: 'cited', count: 1, rate: 0.05, weight: 0.8 },
              { click_kind: 'mentioned', count: 3, rate: 0.15, weight: 0.4 },
            ],
            weighted_score: 0.5,
            warming_up: false,
          },
        ]),
      })
    })
    await page.goto('/inference')
    await expect(page.getByTestId('retrieval-health-panel')).toBeVisible()
    await expect(page.getByTestId('retrieval-vault_search-followed')).toContainText('40%')
    await expect(page.getByTestId('retrieval-vault_search-cited')).toContainText('5%')
    await expect(page.getByTestId('retrieval-vault_search-mentioned')).toContainText('15%')
    // Weighted aggregate surfaces as its own cell — explicitly NOT a
    // flat "any click" rate (which would erase the tier weighting).
    await expect(page.getByTestId('retrieval-vault_search-weighted')).toContainText('0.50')
  })

  test('warming-up state hides bars and surfaces the under-floor reason', async ({ page }) => {
    await page.route(apiUrlPattern(/\/inference\/retrieval-health/), async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            action: 'kiwix_search',
            grounding_count: 5,
            interaction_count: 2,
            by_kind: [{ click_kind: 'followed', count: 2, rate: 0.4, weight: 1.0 }],
            weighted_score: 0.4,
            warming_up: true,
          },
        ]),
      })
    })
    await page.goto('/inference')
    const row = page.getByTestId('retrieval-row-kiwix_search')
    await expect(row).toBeVisible()
    await expect(row).toContainText(/warming up/i)
    await expect(row).toContainText(/only 5 searches/)
    await expect(page.getByTestId('retrieval-kiwix_search-followed')).toHaveCount(0)
  })
})

test.describe('Inference — golden path: expand-row reveals sparklines', () => {
  test('clicking a healthy task row loads + renders both sparklines', async ({ page }) => {
    await page.goto('/inference')
    await page.getByTestId('inference-row-vault-rerank-retrieve').click()
    // Sparkline blocks lazy-load via /inference/sparklines; wait for both to appear.
    await expect(page.getByTestId('sparkline-p95')).toBeVisible()
    await expect(page.getByTestId('sparkline-success')).toBeVisible()
    // The fixture has 4 daily buckets; each renders one bar column in each chart.
    const p95Bars = page.getByTestId('sparkline-p95').locator('[title]')
    await expect(p95Bars).toHaveCount(4)
  })

  test('expand row shows success-predicate basis text', async ({ page }) => {
    await page.goto('/inference')
    await page.getByTestId('inference-row-vault-rerank-retrieve').click()
    await expect(
      page.getByText('vault-rerank-retrieve: matching grounding_events row'),
    ).toBeVisible()
  })

  test('expand row surfaces linked bugs when present', async ({ page }) => {
    await page.goto('/inference')
    await page.getByTestId('inference-row-classify_x').click()
    await expect(page.getByTestId('bug-list-classify_x')).toBeVisible()
    await expect(page.getByTestId('bug-list-classify_x')).toContainText('classify_x flaky on margins')
  })
})
