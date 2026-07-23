import { expect, test } from '@playwright/test'
import { apiRoute } from './lib/api-route'

// ---------------------------------------------------------------------------
// Mock data — mirrors the observe study_runs contract.
//
//   GET /study-runs            → bare JSON array of run summaries
//   GET /study-runs/{run_id}   → one object (summary + provenance + scores)
//
// Host-scoped via apiRoute so the SPA navigation to /assays (a Vite dev
// document load) isn't fulfilled with API JSON. The resourceType()
// document guard is a second belt for path collisions.
// ---------------------------------------------------------------------------

const RUNS = [
  {
    run_id: 'sr-1',
    name: 'casg-direct-v3-smoke',
    assay: 'grounded-glyph-probe',
    item_id: 'casg-direct',
    image_ref: 'localhost/lab-grounded-glyph-probe:dev',
    image_digest: 'sha256:4fe91f54ce7f',
    model_id: 'Qwen2.5-32B-Instruct-Q4_K_M.gguf',
    model_version: 'q4km',
    status: 'completed',
    error: '',
    run_at: '2026-07-09T00:33:10Z',
  },
  {
    run_id: 'sr-2',
    name: 'casg-direct-regression',
    assay: 'grounded-glyph-probe',
    item_id: 'casg-direct',
    image_ref: 'localhost/lab-grounded-glyph-probe:dev',
    image_digest: 'sha256:deadbeefcafe',
    model_id: 'Qwen2.5-32B-Instruct-Q4_K_M.gguf',
    model_version: 'q4km',
    status: 'failed',
    error: 'container exited with code 1',
    run_at: '2026-07-09T01:12:00Z',
  },
]

const RUN_DETAILS: Record<string, object> = {
  'sr-1': {
    ...RUNS[0],
    study_digest: 'abc123def456',
    materials_hashes: { 'scenario.md': 'h1a2b3', 'glyph.md': 'h4c5d6' },
    responses_dir: '/abs/out/responses',
    scores: [
      { condition: 'baseline', run: 1, verdict_kind: 'fail', verdict_reason: 'no glyph produced', item: 'casg-direct', rationale: 'grounded-glyph-probe:baseline:response=2249chars' },
      { condition: 'baseline', run: 2, verdict_kind: 'fail', verdict_reason: 'no glyph produced', item: 'casg-direct', rationale: '...' },
      { condition: 'grounded_glyph', run: 1, verdict_kind: 'pass', verdict_reason: '', item: 'casg-direct', rationale: '...' },
      { condition: 'grounded_glyph', run: 2, verdict_kind: 'pass_with_condition', verdict_reason: 'partial', item: 'casg-direct', rationale: '...' },
    ],
  },
  'sr-2': {
    ...RUNS[1],
    study_digest: '',
    materials_hashes: {},
    responses_dir: '',
    scores: [],
  },
}

function listResponseFor(url: URL): unknown {
  const status = url.searchParams.get('status')
  const assay = url.searchParams.get('assay')
  let runs = [...RUNS]
  if (status) runs = runs.filter(r => r.status === status)
  if (assay) runs = runs.filter(r => r.assay === assay)
  return runs
}

test.beforeEach(async ({ page }) => {
  // List endpoint — anchored so it does NOT swallow /study-runs/{id}.
  await apiRoute(page, '/study-runs', async route => {
    if (route.request().resourceType() === 'document') {
      await route.continue()
      return
    }
    const url = new URL(route.request().url())
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(listResponseFor(url)),
    })
  })

  // Detail endpoint — /study-runs/{run_id}.
  await apiRoute(page, /\/study-runs\/([^/?]+)/, async route => {
    if (route.request().resourceType() === 'document') {
      await route.continue()
      return
    }
    const url = new URL(route.request().url())
    const runId = decodeURIComponent(url.pathname.split('/').pop() ?? '')
    const detail = RUN_DETAILS[runId]
    if (!detail) {
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not found' }) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(detail) })
  })
})

// ---------------------------------------------------------------------------
// Journey 1 — page loads and shows run rows
// ---------------------------------------------------------------------------

test('1: page loads and renders study-run rows', async ({ page }) => {
  await page.goto('/assays')

  await expect(page.locator('[data-testid="assay-row"]').first()).toBeVisible()
  await expect(page.locator('[data-testid="assay-row"]')).toHaveCount(2)
  await expect(page.locator('[data-run-id="sr-1"]')).toBeVisible()
  await expect(page.locator('[data-run-id="sr-2"]')).toBeVisible()
})

// ---------------------------------------------------------------------------
// Journey 2 — status filter sends the status query param and narrows the list
// ---------------------------------------------------------------------------

test('2: status filter sends the status param to /study-runs', async ({ page }) => {
  await page.goto('/assays')
  await expect(page.locator('[data-testid="assay-row"]').first()).toBeVisible()

  const req = page.waitForRequest(r => /\/study-runs(\?|$)/.test(r.url()) && r.resourceType() !== 'document')
  await page.getByTestId('assay-status-filter').selectOption('failed')
  const r = await req

  expect(new URL(r.url()).searchParams.get('status')).toBe('failed')

  // Only the failed run remains visible.
  await expect(page.locator('[data-testid="assay-row"]')).toHaveCount(1)
  await expect(page.locator('[data-run-id="sr-2"]')).toBeVisible()
})

// ---------------------------------------------------------------------------
// Journey 3 — assay filter sends the assay query param
// ---------------------------------------------------------------------------

test('3: assay filter sends the assay param to /study-runs', async ({ page }) => {
  await page.goto('/assays')
  await expect(page.locator('[data-testid="assay-row"]').first()).toBeVisible()

  const req = page.waitForRequest(r => /\/study-runs(\?|$)/.test(r.url()) && r.resourceType() !== 'document')
  // The assay option is populated from the initial 'all' load.
  await page.getByTestId('assay-assay-filter').selectOption('grounded-glyph-probe')
  const r = await req

  expect(new URL(r.url()).searchParams.get('assay')).toBe('grounded-glyph-probe')
})

// ---------------------------------------------------------------------------
// Journey 4 — clicking a run opens the detail panel with provenance
// ---------------------------------------------------------------------------

test('4: clicking a run opens the detail panel with provenance fields', async ({ page }) => {
  await page.goto('/assays')
  await expect(page.locator('[data-testid="assay-row"]').first()).toBeVisible()

  await expect(page.getByText('Select a run to see its details.')).toBeVisible()

  await page.locator('[data-run-id="sr-1"]').click()

  await expect(page.getByTestId('assay-detail-panel')).toBeVisible()
  await expect(page.getByTestId('assay-detail-run-id')).toHaveText('sr-1')
  await expect(page.getByTestId('assay-detail-image-digest')).toHaveText('sha256:4fe91f54ce7f')
  await expect(page.getByTestId('assay-detail-model')).toContainText('Qwen2.5-32B-Instruct-Q4_K_M.gguf')
  await expect(page.getByTestId('assay-detail-model')).toContainText('q4km')
  await expect(page.getByTestId('assay-detail-status')).toHaveText('completed')

  // Row is marked selected.
  await expect(page.locator('[data-run-id="sr-1"]')).toHaveAttribute('aria-selected', 'true')
})

// ---------------------------------------------------------------------------
// Journey 5 — the score grid renders condition × run cells
// ---------------------------------------------------------------------------

test('5: score grid renders per-condition, per-run verdict cells', async ({ page }) => {
  await page.goto('/assays')
  await page.locator('[data-run-id="sr-1"]').click()

  await expect(page.getByTestId('assay-score-grid')).toBeVisible()

  // baseline runs 1 & 2 both FAIL; grounded_glyph passes.
  await expect(page.getByTestId('assay-score-cell-baseline-1')).toContainText('FAIL')
  await expect(page.getByTestId('assay-score-cell-baseline-2')).toContainText('FAIL')
  await expect(page.getByTestId('assay-score-cell-grounded_glyph-1')).toContainText('PASS')
  await expect(page.getByTestId('assay-score-cell-grounded_glyph-2')).toContainText('PASS+')
})

// ---------------------------------------------------------------------------
// Journey 6 — a failed run with no scores shows its error and no grid
// ---------------------------------------------------------------------------

test('6: a failed run with no scores shows the error and an empty grid', async ({ page }) => {
  await page.goto('/assays')
  await page.locator('[data-run-id="sr-2"]').click()

  await expect(page.getByTestId('assay-detail-run-id')).toHaveText('sr-2')
  await expect(page.getByTestId('assay-run-error')).toContainText('container exited with code 1')
  await expect(page.getByTestId('assay-score-grid')).toHaveCount(0)
})
