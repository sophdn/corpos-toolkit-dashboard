import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { getBenchmarkTasks } from '../../api/benchmarks'
import type { BenchmarkTasksResponse } from '../../lib/benchmarkTasks'
import { BenchmarksPage } from '.'

vi.mock('../../api/benchmarks', () => ({
  getBenchmarkTasks: vi.fn(),
}))
const mockGetTasks = vi.mocked(getBenchmarkTasks)

const FIXTURE: BenchmarkTasksResponse = [
  // A rubric-tagged Classify task with rows from two models.
  {
    task_id: 'pre-commit-failure',
    task_shape: 'Classify',
    deployable: true,
    verdict: 'ExtractNowWithQwenDispatch',
    verdict_note: 'smoke 97% accuracy',
    retrigger_condition: null,
    models: [
      {
        model_name: 'qwen2.5-32b',
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
        model_name: 'claude-haiku-4-5-20251001',
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
  // Legacy Retrieve task — no verdict (not in rubric_lib::registry).
  {
    task_id: 'vault-rerank-retrieve',
    task_shape: 'Retrieve',
    deployable: true,
    verdict: null,
    verdict_note: null,
    retrigger_condition: null,
    models: [
      {
        model_name: 'qwen2.5-32b',
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
  // Rejected rubric — non-deployable; renders in the deferred list.
  {
    task_id: 'refactoring-heuristics',
    task_shape: 'Classify',
    deployable: false,
    verdict: 'RejectedRubricTooSoftForQwen',
    verdict_note: 'smoke 60% accuracy',
    retrigger_condition: 'prompt budget allows 4 worked examples',
    models: [],
  },
  // Deferred rubric — non-deployable; renders in the deferred list.
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

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/benchmarks']}>
      <BenchmarksPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockGetTasks.mockReset()
  mockGetTasks.mockResolvedValue(FIXTURE)
})

describe('BenchmarksPage — per-task grid', () => {
  test('renders one card per deployable task', async () => {
    renderPage()
    await waitFor(() =>
      expect(screen.getByTestId('tasks-grid')).toBeInTheDocument(),
    )
    expect(screen.getByTestId('task-card-pre-commit-failure')).toBeInTheDocument()
    expect(screen.getByTestId('task-card-vault-rerank-retrieve')).toBeInTheDocument()
    // Non-deployable tasks do NOT appear as polygon cards.
    expect(screen.queryByTestId('task-card-refactoring-heuristics')).toBeNull()
    expect(screen.queryByTestId('task-card-pre-context-summarization')).toBeNull()
  })

  test('shape tag visible per card', async () => {
    renderPage()
    await waitFor(() => screen.getByTestId('tasks-grid'))
    expect(screen.getByTestId('task-card-pre-commit-failure-shape')).toHaveTextContent(
      'Classify',
    )
    expect(screen.getByTestId('task-card-vault-rerank-retrieve-shape')).toHaveTextContent(
      'Retrieve',
    )
  })

  test('verdict tag visible only for rubric-tagged tasks', async () => {
    renderPage()
    await waitFor(() => screen.getByTestId('tasks-grid'))
    expect(
      screen.getByTestId('task-card-pre-commit-failure-verdict'),
    ).toHaveTextContent('extract-now')
    // Legacy task: no verdict tag.
    expect(
      screen.queryByTestId('task-card-vault-rerank-retrieve-verdict'),
    ).toBeNull()
  })

  test('summary line counts deployable tasks only', async () => {
    renderPage()
    await waitFor(() => screen.getByTestId('benchmarks-summary'))
    // 2 deployable tasks; 2 models across them (qwen, haiku).
    expect(screen.getByTestId('benchmarks-summary')).toHaveTextContent(
      '2 of 2 models across 2 of 2 tasks',
    )
  })
})

describe('BenchmarksPage — shape filter', () => {
  test('renders one pill per task shape', async () => {
    renderPage()
    await waitFor(() => screen.getByTestId('shape-filter'))
    expect(screen.getByTestId('shape-filter-Classify')).toBeInTheDocument()
    expect(screen.getByTestId('shape-filter-Extract')).toBeInTheDocument()
    expect(screen.getByTestId('shape-filter-Retrieve')).toBeInTheDocument()
    expect(screen.getByTestId('shape-filter-Summarize')).toBeInTheDocument()
  })

  test('clicking a shape pill hides cards of that shape', async () => {
    renderPage()
    await waitFor(() => screen.getByTestId('tasks-grid'))
    const user = userEvent.setup()
    await user.click(screen.getByTestId('shape-filter-Classify'))
    // pre-commit-failure is Classify → hidden.
    expect(screen.queryByTestId('task-card-pre-commit-failure')).toBeNull()
    // vault-rerank-retrieve is Retrieve → still visible.
    expect(screen.getByTestId('task-card-vault-rerank-retrieve')).toBeInTheDocument()
  })

  test('summary line updates when shape filter narrows the grid', async () => {
    renderPage()
    await waitFor(() => screen.getByTestId('benchmarks-summary'))
    const user = userEvent.setup()
    await user.click(screen.getByTestId('shape-filter-Classify'))
    expect(screen.getByTestId('benchmarks-summary')).toHaveTextContent(
      '1 of 2 tasks',
    )
  })
})

describe('BenchmarksPage — model filter', () => {
  test('renders one pill per unique model across all tasks', async () => {
    renderPage()
    await waitFor(() => screen.getByTestId('model-filter'))
    expect(
      screen.getByTestId('model-filter-qwen2.5-32b'),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('model-filter-claude-haiku-4-5-20251001'),
    ).toBeInTheDocument()
  })

  test('hiding a model mutes its legend entry per card', async () => {
    renderPage()
    await waitFor(() => screen.getByTestId('tasks-grid'))
    const user = userEvent.setup()
    await user.click(screen.getByTestId('model-filter-claude-haiku-4-5-20251001'))
    expect(
      screen.getByTestId('benchmarks-summary'),
    ).toHaveTextContent('1 of 2 models')
  })
})

describe('BenchmarksPage — deferred ports moved to /deferred-ports', () => {
  test('non-deployable tasks do NOT render on this page', async () => {
    renderPage()
    await waitFor(() => screen.getByTestId('tasks-grid'))
    // The deferred list section was extracted to its own page in
    // /deferred-ports — neither the section nor any deferred-row
    // testid should appear here.
    expect(screen.queryByTestId('deferred-rejected-list')).toBeNull()
    expect(
      screen.queryByTestId('deferred-rejected-refactoring-heuristics'),
    ).toBeNull()
  })
})

describe('BenchmarksPage — verdict histogram', () => {
  test('renders one bar per label when verdict_distribution is populated', async () => {
    // Stand-in fixture: chain-assessment with a mix of three labels
    // across two models. Aggregation across models should sum to
    // proportional=4, disproportional=2, unclear=1 (total 7).
    mockGetTasks.mockResolvedValue([
      {
        task_id: 'chain-assessment',
        task_shape: 'Classify',
        deployable: true,
        verdict: 'ExtractNowWithQwenDispatch',
        verdict_note: null,
        retrigger_condition: null,
        models: [
          {
            model_name: 'qwen2.5-32b',
            n_runs: 5,
            accuracy: 0.9,
            honesty: 1.0,
            ranking_quality: null,
            within_budget: null,
            latency_normalized: 1.0,
            tokens_normalized: 1.0,
            latency_median_ms: 200,
            tokens_median_total: 500,
            verdict_distribution: {
              proportional: 3,
              disproportional: 1,
              unclear: 1,
            },
          },
          {
            model_name: 'claude-haiku-4-5-20251001',
            n_runs: 2,
            accuracy: 1.0,
            honesty: 1.0,
            ranking_quality: null,
            within_budget: null,
            latency_normalized: 0.5,
            tokens_normalized: 0.5,
            latency_median_ms: 800,
            tokens_median_total: 700,
            verdict_distribution: {
              proportional: 1,
              disproportional: 1,
            },
          },
        ],
      },
    ])
    renderPage()
    await waitFor(() => screen.getByTestId('task-card-chain-assessment-verdicts'))
    // proportional 4/7 = 57%, disproportional 2/7 = 29%, unclear 1/7 = 14%.
    expect(
      screen.getByTestId('task-card-chain-assessment-verdict-proportional'),
    ).toHaveTextContent('4 (57%)')
    expect(
      screen.getByTestId('task-card-chain-assessment-verdict-disproportional'),
    ).toHaveTextContent('2 (29%)')
    expect(
      screen.getByTestId('task-card-chain-assessment-verdict-unclear'),
    ).toHaveTextContent('1 (14%)')
  })

  test('omits the histogram when no model has verdict_distribution', async () => {
    // Default FIXTURE has no verdict_distribution on any ModelMetrics.
    renderPage()
    await waitFor(() => screen.getByTestId('task-card-pre-commit-failure'))
    expect(
      screen.queryByTestId('task-card-pre-commit-failure-verdicts'),
    ).toBeNull()
    expect(
      screen.queryByTestId('task-card-vault-rerank-retrieve-verdicts'),
    ).toBeNull()
  })
})

describe('BenchmarksPage — unknown task shape', () => {
  test('a shape outside AXES_BY_SHAPE renders an empty card, not a crash', async () => {
    // task_shape is typed as the closed TaskShape union, but the backend
    // column is free-text. A row whose shape has no AXES_BY_SHAPE entry
    // (e.g. a ping health-check with task_shape="") must not white-screen
    // the whole page — guard renders the card's empty state instead.
    mockGetTasks.mockResolvedValue([
      {
        task_id: 'mystery-task',
        task_shape: 'NotAShape',
        deployable: true,
        verdict: null,
        verdict_note: null,
        retrigger_condition: null,
        models: [
          {
            model_name: 'qwen2.5-32b',
            n_runs: 3,
            accuracy: 0.5,
            honesty: null,
            ranking_quality: null,
            within_budget: null,
            latency_normalized: 1.0,
            tokens_normalized: 1.0,
            latency_median_ms: 100,
            tokens_median_total: 50,
          },
        ],
      },
    ] as unknown as BenchmarkTasksResponse)
    renderPage()
    await waitFor(() => screen.getByTestId('tasks-grid'))
    // The card still renders (no thrown error boundary), with the
    // unknown-shape empty state in place of a radar.
    expect(screen.getByTestId('task-card-mystery-task')).toBeInTheDocument()
    expect(
      screen.getByTestId('task-card-mystery-task-unknown-shape'),
    ).toBeInTheDocument()
  })
})

describe('BenchmarksPage — error handling', () => {
  test('renders the error message when fetch fails and skips the grid', async () => {
    mockGetTasks.mockRejectedValue(new Error('boom'))
    renderPage()
    await waitFor(() => expect(screen.getByText('boom')).toBeInTheDocument())
    expect(screen.queryByTestId('tasks-grid')).toBeNull()
  })
})
