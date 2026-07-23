import { expect, test } from '@playwright/test'
import { apiUrlPattern } from './lib/api-route'

// Playwright e2e spec for the Snapshot Corpus page (chain
// arc-close-snapshot-corpus-capture T6). Mocks
// /telemetry/snapshot-corpus/stats with a deterministic fixture so the
// test asserts page behavior, not server state. Shape mirrors the real
// endpoint verified against toolkit.db (281 rows; 16 live / 265 recovered).

function statsFixture() {
  return {
    total_rows: 281,
    distinct_sessions: 34,
    by_source: { live: 16, recovered: 265 },
    truncated_rows: 281,
    tuple_complete_rows: 259,
    message_count_buckets: [
      { label: '1-5', count: 11 },
      { label: '6-10', count: 2 },
      { label: '11-15', count: 28 },
      { label: '16-19', count: 29 },
      { label: '20', count: 211 },
    ],
    estimated_tokens_buckets: [
      { label: '<1000', count: 0 },
      { label: '1000-1999', count: 22 },
      { label: '2000-2999', count: 93 },
      { label: '3000-3999', count: 159 },
      { label: '4000+', count: 7 },
    ],
  }
}

test.beforeEach(async ({ page }) => {
  await page.route(apiUrlPattern(/\/telemetry\/snapshot-corpus\/stats/), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(statsFixture()),
    })
  })
})

test.describe('Snapshot Corpus — page renders', () => {
  test('shows heading + scalar cards + live/recovered split', async ({ page }) => {
    await page.goto('/telemetry/snapshot-corpus')
    await expect(
      page.getByRole('heading', { name: /Arc-Close Snapshot Corpus/ }),
    ).toBeVisible()
    await expect(page.getByTestId('snapshot-corpus-cards')).toBeVisible()
    await expect(page.getByTestId('stat-total')).toContainText('281')
    await expect(page.getByTestId('source-live')).toContainText('16')
    await expect(page.getByTestId('source-recovered')).toContainText('265')
  })

  test('renders both distribution charts', async ({ page }) => {
    await page.goto('/telemetry/snapshot-corpus')
    await expect(page.getByTestId('chart-message-count')).toBeVisible()
    await expect(page.getByTestId('chart-estimated-tokens')).toBeVisible()
  })

  test('surfaces the holdout-by-session caveat', async ({ page }) => {
    await page.goto('/telemetry/snapshot-corpus')
    await expect(page.getByTestId('snapshot-corpus-caveat')).toContainText(
      /Holdout by session/i,
    )
  })
})
