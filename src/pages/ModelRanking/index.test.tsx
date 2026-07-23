import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { ModelRankingPage } from './index'
import * as api from '../../api/inference'
import type { ToolModelStat } from '../../api/inference'

vi.mock('../../api/inference', async () => {
  const real = await vi.importActual<typeof api>('../../api/inference')
  return { ...real, getInferenceToolModelPerformance: vi.fn() }
})

const mockToolModel = vi.mocked(api.getInferenceToolModelPerformance)

beforeEach(() => {
  mockToolModel.mockReset()
})

function renderPage() {
  return render(
    <MemoryRouter>
      <ModelRankingPage />
    </MemoryRouter>,
  )
}

// The per-tool-per-model ranking characterization, re-homed from
// pages/Inference/index.test.tsx when the ranking was promoted to its own page
// (chain telemetry-page-ia-unification). The data-parity assertions (ranking,
// remote-model row, null avg_tokens em-dash) are preserved verbatim; the
// empty-state assertion is the page's NEW behavior (a panel hid; a page must
// show an explanatory empty-state, not a blank screen).

const TM: ToolModelStat[] = [
  {
    task_id: 'classify_x', model_name: 'qwen2.5-32b', call_count: 40,
    success_rate: 0.75, outcome_success_rate: 0.7, avg_latency_ms: 250, max_latency_ms: 400, avg_tokens: 50,
    last_invoked_at: '2026-05-25 12:00:00',
  },
  {
    task_id: 'classify_x', model_name: 'claude-sonnet-4-6', call_count: 5,
    success_rate: 1, outcome_success_rate: 1, avg_latency_ms: 500, max_latency_ms: 600, avg_tokens: null,
    last_invoked_at: '2026-05-25 11:00:00',
  },
]

describe('ModelRankingPage', () => {
  test('ranks models within a tool; surfaces remote model + null avg_tokens', async () => {
    mockToolModel.mockResolvedValue(TM)
    renderPage()
    await waitFor(() => expect(screen.getByTestId('model-ranking-page')).toBeInTheDocument())

    // Both (tool, model) rows present — including the remote Claude row, which
    // the per-task health cards never surfaced as first-class.
    expect(screen.getByTestId('tool-model-row-classify_x-qwen2.5-32b')).toBeInTheDocument()
    const claudeRow = screen.getByTestId('tool-model-row-classify_x-claude-sonnet-4-6')
    expect(claudeRow).toBeInTheDocument()

    // Computed read-side fields.
    const qwenRow = screen.getByTestId('tool-model-row-classify_x-qwen2.5-32b')
    expect(qwenRow).toHaveTextContent('75%')
    expect(qwenRow).toHaveTextContent('250 ms')
    expect(qwenRow).toHaveTextContent('400 ms')
    // Null avg_tokens renders as em dash, not 0.
    expect(claudeRow).toHaveTextContent('—')
  })

  test('shows an explanatory empty-state when the projection is empty (NEW page behavior)', async () => {
    mockToolModel.mockResolvedValue([])
    renderPage()
    await waitFor(() => expect(screen.getByTestId('model-ranking-empty')).toBeInTheDocument())
    // Not a blank page, and not the table.
    expect(screen.queryByTestId('tool-model-table')).toBeNull()
    expect(screen.getByTestId('model-ranking-empty')).toHaveTextContent(/no inference calls recorded/i)
  })

  test('renders the error state when the fetch fails', async () => {
    mockToolModel.mockRejectedValue(new Error('boom'))
    renderPage()
    await waitFor(() => expect(screen.getByTestId('model-ranking-error')).toHaveTextContent('boom'))
  })
})

// Post-refactor densification (T5): the grouping/ordering input-classes the
// embedded panel never had isolated tests for, now that the ranking is a page
// with its own characterization net. Strictly additive — no parity assertion
// above is modified.
describe('ModelRankingPage — densification: grouping + ordering + transient states', () => {
  test('shows the tool name only on the first row of a group; blank on subsequent same-tool rows', async () => {
    // Two models under one tool -> first row carries the tool label, second does not.
    mockToolModel.mockResolvedValue(TM)
    renderPage()
    await waitFor(() => expect(screen.getByTestId('tool-model-row-classify_x-qwen2.5-32b')).toBeInTheDocument())

    const firstRow = screen.getByTestId('tool-model-row-classify_x-qwen2.5-32b')
    const secondRow = screen.getByTestId('tool-model-row-classify_x-claude-sonnet-4-6')
    // The Tool cell is the first <td>; only the group's first row prints it.
    expect(within(firstRow).getByText('classify_x')).toBeInTheDocument()
    expect(within(secondRow).queryByText('classify_x')).toBeNull()
  })

  test('a new tool re-prints the tool label (group boundary)', async () => {
    const twoTools: ToolModelStat[] = [
      { ...TM[0] },
      {
        task_id: 'vault-rerank-retrieve', model_name: 'qwen2.5-32b', call_count: 12,
        success_rate: 0.9, outcome_success_rate: 0.9, avg_latency_ms: 7000, max_latency_ms: 9000,
        avg_tokens: 1200, last_invoked_at: '2026-05-25 10:00:00',
      },
    ]
    mockToolModel.mockResolvedValue(twoTools)
    renderPage()
    await waitFor(() =>
      expect(screen.getByTestId('tool-model-row-vault-rerank-retrieve-qwen2.5-32b')).toBeInTheDocument(),
    )
    const secondTool = screen.getByTestId('tool-model-row-vault-rerank-retrieve-qwen2.5-32b')
    expect(within(secondTool).getByText('vault-rerank-retrieve')).toBeInTheDocument()
  })

  test('preserves the server row order (the page does not re-sort)', async () => {
    mockToolModel.mockResolvedValue(TM)
    renderPage()
    await waitFor(() => expect(screen.getByTestId('tool-model-table')).toBeInTheDocument())
    const rows = screen.getAllByTestId(/^tool-model-row-/)
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual([
      'tool-model-row-classify_x-qwen2.5-32b',
      'tool-model-row-classify_x-claude-sonnet-4-6',
    ])
  })

  test('a single (tool, model) row renders with its tool label', async () => {
    mockToolModel.mockResolvedValue([TM[0]])
    renderPage()
    await waitFor(() => expect(screen.getByTestId('tool-model-row-classify_x-qwen2.5-32b')).toBeInTheDocument())
    const row = screen.getByTestId('tool-model-row-classify_x-qwen2.5-32b')
    expect(within(row).getByText('classify_x')).toBeInTheDocument()
  })

  test('shows the loading state before the fetch resolves', () => {
    // A pending promise keeps the page in its loading branch.
    mockToolModel.mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(screen.queryByTestId('model-ranking-page')).toBeNull()
  })
})
