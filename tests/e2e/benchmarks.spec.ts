import { expect, test } from '@playwright/test'
import { apiUrlPattern } from './lib/api-route'

// Per chain `benchmarks-page-per-task-redesign` T6 (Playwright lock-in).
// Replaces the prior shape-grid + rubric-grid specs entirely. The page
// renders one card per discrete offload task driven by /benchmarks/
// tasks; non-deployable tasks split into a compact list below the
// grid. Shape + model filter pills AND-combine.

const QWEN = 'qwen2.5-32b'
const HAIKU = 'claude-haiku-4-5-20251001'

const TASKS_RESPONSE = [
  {
    task_id: 'pre-commit-failure',
    task_shape: 'Classify',
    deployable: true,
    verdict: 'ExtractNowWithQwenDispatch',
    verdict_note: 'smoke 97% accuracy',
    retrigger_condition: null,
    models: [
      {
        model_name: QWEN,
        n_runs: 34,
        accuracy: 0.97,
        honesty: 1.0,
        ranking_quality: null,
        within_budget: null,
        latency_normalized: 1.0,
        tokens_normalized: 1.0,
        latency_median_ms: 170,
        tokens_median_total: 600,
      },
      {
        model_name: HAIKU,
        n_runs: 12,
        accuracy: 0.99,
        honesty: 1.0,
        ranking_quality: null,
        within_budget: null,
        latency_normalized: 0.5,
        tokens_normalized: 0.6,
        latency_median_ms: 850,
        tokens_median_total: 720,
      },
    ],
  },
  {
    task_id: 'vault-rerank-retrieve',
    task_shape: 'Retrieve',
    deployable: true,
    verdict: null,
    verdict_note: null,
    retrigger_condition: null,
    models: [
      {
        model_name: QWEN,
        n_runs: 17,
        accuracy: 1.0,
        honesty: 1.0,
        ranking_quality: 1.0,
        within_budget: null,
        latency_normalized: 1.0,
        tokens_normalized: 1.0,
        latency_median_ms: 1936,
        tokens_median_total: 861,
      },
    ],
  },
  {
    task_id: 'refactoring-heuristics',
    task_shape: 'Classify',
    deployable: false,
    verdict: 'RejectedRubricTooSoftForQwen',
    verdict_note: 'smoke 60% accuracy',
    retrigger_condition: 'prompt budget allows 4 worked examples',
    models: [],
  },
  {
    task_id: 'pre-context-summarization',
    task_shape: 'Summarize',
    deployable: false,
    verdict: 'DeferredWithTrigger',
    verdict_note: '99% term-preservation, 41% within-budget',
    retrigger_condition: 'deployed call site uses compose_summarize',
    models: [],
  },
]

test.beforeEach(async ({ page }) => {
  await page.route(apiUrlPattern(/\/benchmarks\/tasks/), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(TASKS_RESPONSE),
    })
  })
})

test.describe('Benchmarks per-task grid', () => {
  test('renders one card per deployable task', async ({ page }) => {
    await page.goto('/benchmarks')
    await expect(page.getByTestId('tasks-grid')).toBeVisible()
    await expect(page.getByTestId('task-card-pre-commit-failure')).toBeVisible()
    await expect(page.getByTestId('task-card-vault-rerank-retrieve')).toBeVisible()
    // Non-deployable tasks do NOT appear in the grid.
    await expect(page.getByTestId('task-card-refactoring-heuristics')).toHaveCount(0)
  })

  test('shape tag visible per card', async ({ page }) => {
    await page.goto('/benchmarks')
    await expect(
      page.getByTestId('task-card-pre-commit-failure-shape'),
    ).toContainText('Classify')
    await expect(
      page.getByTestId('task-card-vault-rerank-retrieve-shape'),
    ).toContainText('Retrieve')
  })

  test('verdict tag visible only for rubric-tagged tasks', async ({ page }) => {
    await page.goto('/benchmarks')
    await expect(
      page.getByTestId('task-card-pre-commit-failure-verdict'),
    ).toContainText('extract-now')
    await expect(
      page.getByTestId('task-card-vault-rerank-retrieve-verdict'),
    ).toHaveCount(0)
  })

  test('per-card legend shows each model with run count', async ({ page }) => {
    await page.goto('/benchmarks')
    const pcfQwen = page.getByTestId(`task-card-pre-commit-failure-legend-${QWEN}`)
    await expect(pcfQwen).toContainText('n=34')
    const pcfHaiku = page.getByTestId(
      `task-card-pre-commit-failure-legend-${HAIKU}`,
    )
    await expect(pcfHaiku).toContainText('n=12')
  })
})

test.describe('Benchmarks shape filter', () => {
  test('renders one pill per task shape', async ({ page }) => {
    await page.goto('/benchmarks')
    await expect(page.getByTestId('shape-filter-Classify')).toBeVisible()
    await expect(page.getByTestId('shape-filter-Extract')).toBeVisible()
    await expect(page.getByTestId('shape-filter-Retrieve')).toBeVisible()
    await expect(page.getByTestId('shape-filter-Summarize')).toBeVisible()
  })

  test('clicking a shape pill hides cards of that shape', async ({ page }) => {
    await page.goto('/benchmarks')
    await page.getByTestId('shape-filter-Classify').click()
    await expect(page.getByTestId('task-card-pre-commit-failure')).toHaveCount(0)
    await expect(page.getByTestId('task-card-vault-rerank-retrieve')).toBeVisible()
  })

  test('summary updates when shape filter narrows the grid', async ({ page }) => {
    await page.goto('/benchmarks')
    const summary = page.getByTestId('benchmarks-summary')
    await expect(summary).toContainText('2 of 2 tasks')
    await page.getByTestId('shape-filter-Classify').click()
    await expect(summary).toContainText('1 of 2 tasks')
  })
})

test.describe('Benchmarks model filter', () => {
  test('renders one pill per unique model across tasks', async ({ page }) => {
    await page.goto('/benchmarks')
    await expect(page.getByTestId(`model-filter-${QWEN}`)).toBeVisible()
    await expect(page.getByTestId(`model-filter-${HAIKU}`)).toBeVisible()
  })

  test('hiding a model updates the summary count', async ({ page }) => {
    await page.goto('/benchmarks')
    const summary = page.getByTestId('benchmarks-summary')
    await expect(summary).toContainText('2 of 2 models')
    await page.getByTestId(`model-filter-${HAIKU}`).click()
    await expect(summary).toContainText('1 of 2 models')
  })
})

test.describe('Benchmarks page no longer hosts the deferred list', () => {
  test('deferred list testid does NOT appear on /benchmarks', async ({ page }) => {
    await page.goto('/benchmarks')
    // The deferred list moved to /deferred-ports per chain
    // benchmarks-page-per-task-redesign-followup. Keep this assertion
    // as a regression backstop: anyone who re-adds a deferred section
    // here should have to update this test.
    await expect(page.getByTestId('deferred-rejected-list')).toHaveCount(0)
  })

  test('h1 reads the redesigned title', async ({ page }) => {
    await page.goto('/benchmarks')
    await expect(
      page.getByRole('heading', { name: 'Local LLM Task Performance' }),
    ).toBeVisible()
  })
})

test.describe('DeferredPortsPage at /deferred-ports', () => {
  test('renders one row per non-deployable task', async ({ page }) => {
    await page.goto('/deferred-ports')
    await expect(page.getByTestId('deferred-ports-list')).toBeVisible()
    await expect(
      page.getByTestId('deferred-port-refactoring-heuristics'),
    ).toBeVisible()
    await expect(
      page.getByTestId('deferred-port-pre-context-summarization'),
    ).toBeVisible()
  })

  test('does NOT render deployable tasks', async ({ page }) => {
    await page.goto('/deferred-ports')
    await expect(
      page.getByTestId('deferred-port-pre-commit-failure'),
    ).toHaveCount(0)
  })

  test('row carries verdict + retrigger condition', async ({ page }) => {
    await page.goto('/deferred-ports')
    const rh = page.getByTestId('deferred-port-refactoring-heuristics')
    await expect(rh).toContainText('rejected')
    await expect(rh).toContainText('prompt budget allows 4 worked examples')
  })
})
