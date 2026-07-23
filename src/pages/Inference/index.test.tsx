import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, test, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { InferencePage } from './index'
import * as api from '../../api/inference'
import * as http from '../../lib/http'
import type { HealthCard, Sparkline } from '../../api/inference'

vi.mock('../../api/inference', async () => {
  const real = await vi.importActual<typeof api>('../../api/inference')
  return {
    ...real,
    getInferenceHealthCards: vi.fn(),
    getInferenceSparklines: vi.fn(),
    getInferenceRetrievalHealth: vi.fn(),
  }
})
vi.mock('../../lib/http', () => ({ get: vi.fn() }))

const mockHealthCards = vi.mocked(api.getInferenceHealthCards)
const mockSparklines = vi.mocked(api.getInferenceSparklines)
const mockRetrievalHealth = vi.mocked(api.getInferenceRetrievalHealth)
const mockHttpGet = vi.mocked(http.get)

beforeEach(() => {
  mockHealthCards.mockReset()
  mockSparklines.mockReset()
  mockRetrievalHealth.mockReset()
  mockHttpGet.mockReset()
  // Default bugs response — empty.
  mockHttpGet.mockResolvedValue([])
  // Default retrieval-health response — empty (panel hides).
  mockRetrievalHealth.mockResolvedValue([])
})

const HEALTHY: HealthCard = {
  task_id: 'vault-rerank-retrieve',
  last_call_at: new Date(Date.now() - 30 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19),
  call_count: 101,
  p50_latency_ms: 7020,
  p95_latency_ms: 10533,
  p99_latency_ms: 13062,
  success_rate: 0.97,
  success_rate_basis: 'vault-rerank-retrieve: predicate basis',
  bug_count: 0,
  tokens_per_day: 14315,
  model_breakdown: [
    { model_name: 'qwen2.5-32b', call_count: 101, p95_latency_ms: 10533 },
  ],
  warming_up: { p99: false, success_rate: false, sparklines: false },
}

const WARMING_UP: HealthCard = {
  task_id: 'knowledge-search',
  last_call_at: new Date(Date.now() - 30 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19),
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
}

const STALE: HealthCard = {
  task_id: 'classify_x',
  last_call_at: new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19),
  call_count: 25,
  p50_latency_ms: 100,
  p95_latency_ms: 200,
  p99_latency_ms: null,
  success_rate: 0.8,
  success_rate_basis: 'classify: …',
  bug_count: 2,
  tokens_per_day: 100,
  model_breakdown: [
    { model_name: 'qwen2.5-32b', call_count: 25, p95_latency_ms: 200 },
  ],
  warming_up: { p99: true, success_rate: false, sparklines: false },
}

function renderPage() {
  return render(
    <MemoryRouter>
      <InferencePage />
    </MemoryRouter>,
  )
}

describe('InferencePage', () => {
  test('renders one row per task_id with p50/p95/p99/success%', async () => {
    mockHealthCards.mockResolvedValue([HEALTHY])
    renderPage()
    await waitFor(() => expect(screen.getByTestId('inference-table')).toBeInTheDocument())
    expect(screen.getByText('vault-rerank-retrieve')).toBeInTheDocument()
    expect(screen.getByText('7020 ms')).toBeInTheDocument()
    expect(screen.getByText('10533 ms')).toBeInTheDocument()
    expect(screen.getByText('13062 ms')).toBeInTheDocument()
    expect(screen.getByText('97%')).toBeInTheDocument()
  })

  test('shows warming-up badge for p99 and success_rate when flags are set', async () => {
    mockHealthCards.mockResolvedValue([WARMING_UP])
    renderPage()
    await waitFor(() => expect(screen.getByTestId('inference-table')).toBeInTheDocument())
    const badges = screen.getAllByTestId('warming-up-badge')
    // p99 + success_rate badges = 2 in row, no sparkline badge (closed).
    expect(badges.length).toBeGreaterThanOrEqual(2)
    const badgeTexts = badges.map((b) => b.textContent)
    expect(badgeTexts.some((t) => t?.includes('p99'))).toBe(true)
    expect(badgeTexts.some((t) => t?.includes('success'))).toBe(true)
  })

  test('renders traffic-light tints — green for <1h, red for ≥24h', async () => {
    mockHealthCards.mockResolvedValue([HEALTHY, STALE])
    renderPage()
    await waitFor(() => expect(screen.getByTestId('inference-table')).toBeInTheDocument())
    const greenCell = screen.getByTestId('stale-vault-rerank-retrieve')
    const redCell = screen.getByTestId('stale-classify_x')
    expect(greenCell.className).toContain('green')
    expect(redCell.className).toContain('red')
  })

  test('model summary block renders one row per model', async () => {
    mockHealthCards.mockResolvedValue([HEALTHY])
    renderPage()
    await waitFor(() => expect(screen.getByTestId('model-summary')).toBeInTheDocument())
    expect(screen.getByText('qwen2.5-32b')).toBeInTheDocument()
  })

  test('empty state when no cards', async () => {
    mockHealthCards.mockResolvedValue([])
    renderPage()
    await waitFor(() => expect(screen.getByText(/No inference calls/i)).toBeInTheDocument())
  })

  test('error state when fetch fails', async () => {
    mockHealthCards.mockRejectedValue(new Error('boom'))
    renderPage()
    await waitFor(() => expect(screen.getByText(/boom/i)).toBeInTheDocument())
  })
})

describe('staleTierForLastCall', () => {
  test('green when last_call_at < 1h ago', () => {
    const ts = new Date(Date.now() - 30 * 60 * 1000)
      .toISOString().replace('T', ' ').slice(0, 19)
    expect(api.staleTierForLastCall(ts)).toBe('green')
  })

  test('yellow when last_call_at between 1h and 24h ago', () => {
    const ts = new Date(Date.now() - 10 * 60 * 60 * 1000)
      .toISOString().replace('T', ' ').slice(0, 19)
    expect(api.staleTierForLastCall(ts)).toBe('yellow')
  })

  test('red when last_call_at ≥ 24h ago', () => {
    const ts = new Date(Date.now() - 36 * 60 * 60 * 1000)
      .toISOString().replace('T', ' ').slice(0, 19)
    expect(api.staleTierForLastCall(ts)).toBe('red')
  })

  test('unknown when last_call_at is null', () => {
    expect(api.staleTierForLastCall(null)).toBe('unknown')
  })
})

describe('RetrievalHealthPanel', () => {
  test('hides entirely when retrieval data is empty (degrade-gracefully)', async () => {
    mockHealthCards.mockResolvedValue([HEALTHY])
    mockRetrievalHealth.mockResolvedValue([])
    renderPage()
    await waitFor(() => expect(screen.getByTestId('inference-table')).toBeInTheDocument())
    expect(screen.queryByTestId('retrieval-health-panel')).toBeNull()
  })

  test('renders one row per action with tiered per-kind cells', async () => {
    mockHealthCards.mockResolvedValue([HEALTHY])
    mockRetrievalHealth.mockResolvedValue([
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
    ])
    renderPage()
    await waitFor(() => expect(screen.getByTestId('retrieval-health-panel')).toBeInTheDocument())
    expect(screen.getByTestId('retrieval-row-vault_search')).toBeInTheDocument()
    // Per-kind cells render at their per-kind rate.
    expect(screen.getByTestId('retrieval-vault_search-followed')).toHaveTextContent('40%')
    expect(screen.getByTestId('retrieval-vault_search-cited')).toHaveTextContent('5%')
    expect(screen.getByTestId('retrieval-vault_search-mentioned')).toHaveTextContent('15%')
    // Weighted score surfaces as a separate cell — NOT a flat "any click" aggregate.
    expect(screen.getByTestId('retrieval-vault_search-weighted')).toHaveTextContent('0.50')
  })

  test('renders warming-up badge instead of bars when below the sample floor', async () => {
    mockHealthCards.mockResolvedValue([HEALTHY])
    mockRetrievalHealth.mockResolvedValue([
      {
        action: 'kiwix_search',
        grounding_count: 5,
        interaction_count: 2,
        by_kind: [
          { click_kind: 'followed', count: 2, rate: 0.4, weight: 1.0 },
        ],
        weighted_score: 0.4,
        warming_up: true,
      },
    ])
    renderPage()
    await waitFor(() => expect(screen.getByTestId('retrieval-row-kiwix_search')).toBeInTheDocument())
    const row = screen.getByTestId('retrieval-row-kiwix_search')
    expect(row).toHaveTextContent(/warming up/i)
    expect(row).toHaveTextContent(/only 5 searches/)
    // No per-kind cells in warming-up state.
    expect(screen.queryByTestId('retrieval-kiwix_search-followed')).toBeNull()
  })

  test('renders multiple actions in given order', async () => {
    mockHealthCards.mockResolvedValue([HEALTHY])
    mockRetrievalHealth.mockResolvedValue([
      {
        action: 'kiwix_search', grounding_count: 30, interaction_count: 5,
        by_kind: [{ click_kind: 'mentioned', count: 5, rate: 0.17, weight: 0.4 }],
        weighted_score: 0.07, warming_up: false,
      },
      {
        action: 'vault_search', grounding_count: 20, interaction_count: 12,
        by_kind: [{ click_kind: 'followed', count: 12, rate: 0.6, weight: 1.0 }],
        weighted_score: 0.6, warming_up: false,
      },
    ])
    renderPage()
    await waitFor(() => expect(screen.getByTestId('retrieval-health-panel')).toBeInTheDocument())
    expect(screen.getByTestId('retrieval-row-kiwix_search')).toBeInTheDocument()
    expect(screen.getByTestId('retrieval-row-vault_search')).toBeInTheDocument()
  })
})

// The per-tool-per-model ranking moved to its own page in chain
// telemetry-page-ia-unification; its characterization now lives in
// src/pages/ModelRanking/index.test.tsx (re-homed, not dropped).

describe('sparkline expansion', () => {
  test('clicking a row reveals expand-row with sparkline once data loads', async () => {
    mockHealthCards.mockResolvedValue([HEALTHY])
    const sparkline: Sparkline = {
      task_id: 'vault-rerank-retrieve',
      buckets: [
        { date: '2026-05-16', call_count: 9, p95_latency_ms: 11743, success_rate: 1, tokens_burned: 41273 },
        { date: '2026-05-17', call_count: 29, p95_latency_ms: 11005, success_rate: 0.9, tokens_burned: 129990 },
        { date: '2026-05-18', call_count: 28, p95_latency_ms: 13062, success_rate: 1, tokens_burned: 117877 },
      ],
    }
    mockSparklines.mockResolvedValue([sparkline])
    const { container } = renderPage()
    await waitFor(() => expect(screen.getByTestId('inference-table')).toBeInTheDocument())

    // Find the data row and click it.
    const row = screen.getByTestId('inference-row-vault-rerank-retrieve')
    row.click()

    await waitFor(() => expect(container.querySelector('[data-testid="sparkline-p95"]')).toBeInTheDocument())
    expect(container.querySelector('[data-testid="sparkline-success"]')).toBeInTheDocument()
    expect(mockSparklines).toHaveBeenCalledWith(
      expect.objectContaining({ task_id: 'vault-rerank-retrieve' }),
    )
  })

  test('warming-up sparklines flag hides the sparkline render', async () => {
    const warmupSparklineCard: HealthCard = {
      ...HEALTHY,
      warming_up: { p99: false, success_rate: false, sparklines: true },
    }
    mockHealthCards.mockResolvedValue([warmupSparklineCard])
    renderPage()
    await waitFor(() => expect(screen.getByTestId('inference-table')).toBeInTheDocument())
    screen.getByTestId('inference-row-vault-rerank-retrieve').click()
    await waitFor(() => {
      const badges = screen.getAllByTestId('warming-up-badge')
      expect(badges.some((b) => b.textContent?.includes('sparklines'))).toBe(true)
    })
    expect(mockSparklines).not.toHaveBeenCalled()
  })
})
