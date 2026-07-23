import { expect, test } from '@playwright/test'
import { apiUrlPattern } from './lib/api-route'

// Playwright tests for the Knowledge Index page (/knowledge).
// Per chain unified-knowledge-index T10.

const CARD_RESPONSE = {
  total_active_pointers: 230,
  by_source_type: [
    { source_type: 'vault', count: 114 },
    { source_type: 'library', count: 92 },
    { source_type: 'task', count: 20 },
    { source_type: 'chain', count: 4 },
  ],
  pending_curation_candidates: 7,
  top_queried: [
    {
      id: 120,
      source_type: 'vault',
      source_ref: '.claude/vault/decisions/2026-05-11_unified-knowledge-index-architecture.md',
      question: 'What does unified-knowledge-index architecture spec document?',
      usage_count: 12,
    },
    {
      id: 102,
      source_type: 'vault',
      source_ref: '.claude/vault/decisions/2026-05-09_two-pass-rerank.md',
      question: 'What does Two-pass LLM rerank beats embedding prefilter document?',
      usage_count: 8,
    },
  ],
  recently_added: [
    {
      id: 230,
      source_type: 'chain',
      source_ref: 'seed-packet::vault-rag-precision-sharpening',
      question: 'What did chain vault-rag-precision-sharpening accomplish?',
      created_at: '2026-05-12 00:14:43',
    },
    {
      id: 229,
      source_type: 'chain',
      source_ref: 'seed-packet::benchmarks-framework-reshape',
      question: 'What did chain benchmarks-framework-reshape accomplish?',
      created_at: '2026-05-12 00:14:43',
    },
  ],
  grounding_summary: {
    total_search_calls: 6,
    used_count: 2,
    used_pct: 33.3,
    zero_result_gap_count: 4,
    pure_memory_sessions: 3,
  },
}

test.beforeEach(async ({ page }) => {
  await page.route(apiUrlPattern(/\/knowledge\/index-card/), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(CARD_RESPONSE),
    })
  })
})

test.describe('Knowledge Index page — card renders with seeded data', () => {
  test('renders page heading and summary bar', async ({ page }) => {
    await page.goto('/knowledge')
    await expect(page.getByRole('heading', { name: 'Knowledge Index' })).toBeVisible()
    await expect(page.getByTestId('knowledge-summary-bar')).toBeVisible()
  })

  test('stat boxes show correct values', async ({ page }) => {
    await page.goto('/knowledge')
    await expect(page.getByTestId('stat-total-pointers')).toContainText('230')
    await expect(page.getByTestId('stat-pending-candidates')).toContainText('7')
    await expect(page.getByTestId('stat-recent-additions')).toContainText('2')
    await expect(page.getByTestId('stat-search-calls')).toContainText('6')
  })
})

test.describe('Knowledge Index page — source type breakdown', () => {
  test('renders one pill per source type', async ({ page }) => {
    await page.goto('/knowledge')
    await expect(page.getByTestId('source-type-breakdown')).toBeVisible()
    await expect(page.getByTestId('source-type-vault')).toBeVisible()
    await expect(page.getByTestId('source-type-library')).toBeVisible()
    await expect(page.getByTestId('source-type-task')).toBeVisible()
    await expect(page.getByTestId('source-type-chain')).toBeVisible()
  })

  test('source type pills show correct counts', async ({ page }) => {
    await page.goto('/knowledge')
    await expect(page.getByTestId('source-type-vault')).toContainText('114')
    await expect(page.getByTestId('source-type-library')).toContainText('92')
    await expect(page.getByTestId('source-type-task')).toContainText('20')
    await expect(page.getByTestId('source-type-chain')).toContainText('4')
  })
})

test.describe('Knowledge Index page — grounding summary', () => {
  test('grounding summary section renders correct values', async ({ page }) => {
    await page.goto('/knowledge')
    await expect(page.getByTestId('grounding-summary')).toBeVisible()
    await expect(page.getByTestId('grounding-search-calls')).toContainText('6')
    await expect(page.getByTestId('grounding-used-pct')).toContainText('33.3%')
    await expect(page.getByTestId('grounding-zero-result-gaps')).toContainText('4')
    await expect(page.getByTestId('grounding-pure-memory-sessions')).toContainText('3')
  })
})

test.describe('Knowledge Index page — top queried and recently added', () => {
  test('top queried table renders known pointers', async ({ page }) => {
    await page.goto('/knowledge')
    await expect(page.getByTestId('top-queried-table')).toBeVisible()
    await expect(page.getByTestId('top-pointer-120')).toBeVisible()
    await expect(page.getByTestId('top-pointer-102')).toBeVisible()
  })

  test('recently added table renders recent pointers', async ({ page }) => {
    await page.goto('/knowledge')
    await expect(page.getByTestId('recently-added-table')).toBeVisible()
    await expect(page.getByTestId('recent-pointer-230')).toBeVisible()
    await expect(page.getByTestId('recent-pointer-229')).toBeVisible()
  })
})

// Pending-curation stat box dedicated coverage — added as part of chain
// curation-go-migration T2 baseline. The existing 'stat boxes show
// correct values' test asserts the value renders; these tests pin the
// >10 styling threshold (per Knowledge/index.tsx:59) so the warn class
// has explicit coverage. Without this, a future restyle could silently
// drop the threshold without any test failing.
test.describe('Knowledge Index page — pending curation stat box', () => {
  test('renders zero pending without warn class', async ({ page }) => {
    const zeroResponse = { ...CARD_RESPONSE, pending_curation_candidates: 0 }
    await page.route(apiUrlPattern(/\/knowledge\/index-card/), async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(zeroResponse),
      })
    })
    await page.goto('/knowledge')
    const stat = page.getByTestId('stat-pending-candidates')
    await expect(stat).toContainText('0')
    // Warn class should NOT be present at zero.
    const valueDiv = stat.locator('div').last()
    await expect(valueDiv).not.toHaveClass(/statValueWarn/)
  })

  test('large pending count triggers warn styling', async ({ page }) => {
    const highResponse = { ...CARD_RESPONSE, pending_curation_candidates: 447 }
    await page.route(apiUrlPattern(/\/knowledge\/index-card/), async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(highResponse),
      })
    })
    await page.goto('/knowledge')
    const stat = page.getByTestId('stat-pending-candidates')
    await expect(stat).toContainText('447')
    // Threshold per index.tsx:59 is > 10. The CSS module hashes the class
    // name, so match by substring.
    const valueDiv = stat.locator('div').last()
    await expect(valueDiv).toHaveClass(/statValueWarn/)
  })
})
