import { expect, test } from '@playwright/test'
import { apiUrlPattern } from './lib/api-route'

// Playwright e2e spec for the Memory Substrate page (chain
// memory-substrate-within-vault T8). Mocks /knowledge/memory-substrate with
// a deterministic fixture so the test asserts page behavior, not server
// state. Shape mirrors the real endpoint verified against toolkit.db
// (82 memories; 98 MemoryWritten events; 92 migration / 4 manual).

function statsFixture() {
  return {
    total_memories: 82,
    by_kind: [
      { key: 'feedback', count: 49 },
      { key: 'project', count: 18 },
      { key: 'reference', count: 12 },
      { key: 'user', count: 3 },
    ],
    memory_written_total: 98,
    by_source: [
      { key: 'migration', count: 92 },
      { key: 'manual', count: 4 },
      { key: 'user-correction-2026-05-22', count: 1 },
      { key: '(unset)', count: 1 },
    ],
    event_rate: [
      { day: '2026-05-22', count: 93 },
      { day: '2026-05-24', count: 5 },
    ],
    parse_context_hits: 50,
    oldest_filed_at: '2026-05-22T18:34:54.571Z',
    newest_filed_at: '2026-05-24T23:38:25.840Z',
  }
}

test.beforeEach(async ({ page }) => {
  await page.route(apiUrlPattern(/\/knowledge\/memory-substrate/), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(statsFixture()),
    })
  })
})

test.describe('Memory Substrate — page renders', () => {
  test('shows heading + scalar cards', async ({ page }) => {
    await page.goto('/knowledge/memory-substrate')
    await expect(page.getByRole('heading', { name: /Memory Substrate/ })).toBeVisible()
    await expect(page.getByTestId('memory-substrate-cards')).toBeVisible()
    await expect(page.getByTestId('stat-total-memories')).toContainText('82')
    await expect(page.getByTestId('stat-events')).toContainText('98')
    await expect(page.getByTestId('stat-parse-context-hits')).toContainText('50')
  })

  test('renders the by-kind, by-source, and event-rate charts', async ({ page }) => {
    await page.goto('/knowledge/memory-substrate')
    await expect(page.getByTestId('chart-by-kind')).toBeVisible()
    await expect(page.getByTestId('chart-by-source')).toBeVisible()
    await expect(page.getByTestId('chart-event-rate')).toBeVisible()
  })

  test('surfaces the first-pass / legacy-writer caveat', async ({ page }) => {
    await page.goto('/knowledge/memory-substrate')
    await expect(page.getByTestId('memory-substrate-caveat')).toContainText(/First-pass/i)
  })
})
