import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { getBenchmarkTasks } from '../../api/benchmarks'
import type { BenchmarkTasksResponse } from '../../lib/benchmarkTasks'
import { DeferredPortsPage } from '.'

vi.mock('../../api/benchmarks', () => ({
  getBenchmarkTasks: vi.fn(),
}))
const mockGetTasks = vi.mocked(getBenchmarkTasks)

const FIXTURE: BenchmarkTasksResponse = [
  // A deployable task — should NOT appear on the deferred-ports page.
  {
    task_id: 'pre-commit-failure',
    task_shape: 'Classify',
    deployable: true,
    verdict: 'ExtractNowWithQwenDispatch',
    verdict_note: null,
    retrigger_condition: null,
    models: [],
  },
  // Rejected.
  {
    task_id: 'refactoring-heuristics',
    task_shape: 'Classify',
    deployable: false,
    verdict: 'RejectedRubricTooSoftForQwen',
    verdict_note: 'smoke 60% accuracy',
    retrigger_condition: 'prompt budget allows 4 worked examples',
    models: [],
  },
  // Deferred.
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
    <MemoryRouter initialEntries={['/deferred-ports']}>
      <DeferredPortsPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockGetTasks.mockReset()
  mockGetTasks.mockResolvedValue(FIXTURE)
})

describe('DeferredPortsPage', () => {
  test('renders one row per non-deployable task', async () => {
    renderPage()
    await waitFor(() =>
      expect(screen.getByTestId('deferred-ports-list')).toBeInTheDocument(),
    )
    expect(
      screen.getByTestId('deferred-port-refactoring-heuristics'),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('deferred-port-pre-context-summarization'),
    ).toBeInTheDocument()
  })

  test('does NOT render deployable tasks', async () => {
    renderPage()
    await waitFor(() => screen.getByTestId('deferred-ports-list'))
    expect(
      screen.queryByTestId('deferred-port-pre-commit-failure'),
    ).toBeNull()
  })

  test('row shows shape + verdict + verdict note + retrigger', async () => {
    renderPage()
    await waitFor(() => screen.getByTestId('deferred-ports-list'))
    const rh = screen.getByTestId('deferred-port-refactoring-heuristics')
    expect(rh).toHaveTextContent('Classify')
    expect(rh).toHaveTextContent('rejected')
    expect(rh).toHaveTextContent('smoke 60% accuracy')
    expect(rh).toHaveTextContent('prompt budget allows 4 worked examples')
  })

  test('h1 reads "Deferred Ports"', async () => {
    renderPage()
    await waitFor(() => screen.getByText('Deferred Ports'))
  })

  test('renders empty state when no non-deployable tasks', async () => {
    mockGetTasks.mockResolvedValue(FIXTURE.filter((t) => t.deployable))
    renderPage()
    await waitFor(() =>
      screen.getByText(/every smoked rubric is dispatchable/i),
    )
    expect(screen.queryByTestId('deferred-ports-list')).toBeNull()
  })

  test('renders error when fetch fails', async () => {
    mockGetTasks.mockRejectedValue(new Error('boom'))
    renderPage()
    await waitFor(() => expect(screen.getByText('boom')).toBeInTheDocument())
    expect(screen.queryByTestId('deferred-ports-list')).toBeNull()
  })
})
