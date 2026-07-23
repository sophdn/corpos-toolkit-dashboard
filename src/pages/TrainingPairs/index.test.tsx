import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getTrainingPairs,
  getTrainingPairsStats,
} from '../../api/telemetry'
import type {
  TrainingPairItem,
  TrainingPairsStatsResponse,
} from '../../lib/telemetry'
import { TrainingPairsBrowser } from '.'

vi.mock('../../api/telemetry', () => ({
  getTrainingPairs: vi.fn(),
  getTrainingPairsStats: vi.fn(),
}))

const mockList = vi.mocked(getTrainingPairs)
const mockStats = vi.mocked(getTrainingPairsStats)

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/telemetry/training-pairs" element={<TrainingPairsBrowser />} />
      </Routes>
    </MemoryRouter>,
  )
}

const statsFixture = (
  overrides: Partial<TrainingPairsStatsResponse> = {},
): TrainingPairsStatsResponse => ({
  total_pairs: 105,
  by_label_kind: {
    positive: 8,
    weakly_positive: 3,
    negative: 84,
    hard_negative: 10,
    unlabeled: 0,
  },
  by_query_source: {
    agent_initiated: 98,
    proactive_hook: 0,
    dashboard_user: 0,
    other: 7,
  },
  by_action: { vault_search: 85, kiwix_search: 20 },
  ...overrides,
})

const pairItem = (overrides: Partial<TrainingPairItem> = {}): TrainingPairItem => ({
  training_id: 1,
  grounding_event_id: 100,
  query_text: 'how to fix flaky test',
  candidate_pointer_id: 50,
  source_ref: 'learnings/mcp-servers/test-isolation.md',
  candidate_position: 1,
  label_kind: 'positive',
  weight: 1.0,
  label_sources: ['followed'],
  query_source: 'agent_initiated',
  was_injected: 0,
  prompt_id: 'prompt-1',
  span_id: 'span-1',
  ...overrides,
})

beforeEach(() => {
  mockList.mockReset()
  mockStats.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('TrainingPairsBrowser — stats banner', () => {
  it('renders all five label_kind buckets, including zero-filled', async () => {
    mockStats.mockResolvedValue(statsFixture())
    mockList.mockResolvedValue({ items: [], next_cursor: null, page_size: 50 })

    renderAt('/telemetry/training-pairs')
    await waitFor(() =>
      expect(screen.getByTestId('training-pairs-stats')).toBeInTheDocument(),
    )
    // The 5-cell bar always includes all enum values; unlabeled
    // renders with count 0 (zero-fill invariant per Go telemetry.go).
    for (const kind of [
      'positive',
      'weakly_positive',
      'negative',
      'hard_negative',
      'unlabeled',
    ]) {
      expect(
        screen.getByTestId(`training-pairs-label-kind-${kind}`),
      ).toBeInTheDocument()
    }
    expect(
      screen.getByTestId('training-pairs-label-kind-unlabeled').getAttribute('data-count'),
    ).toBe('0')
  })

  // TT1.5 §5: weakly_positive is a DIFFERENT signal strength from
  // positive (max_weight < 0.8 vs >= 0.8). The badge styling must
  // distinguish them — this test pins data-label-kind attributes and
  // asserts the class differs.
  it('weakly_positive renders distinctly from positive', async () => {
    mockStats.mockResolvedValue(statsFixture())
    mockList.mockResolvedValue({ items: [], next_cursor: null, page_size: 50 })

    renderAt('/telemetry/training-pairs')
    await waitFor(() =>
      expect(screen.getByTestId('training-pairs-stats')).toBeInTheDocument(),
    )
    const posCell = screen.getByTestId('training-pairs-label-kind-positive')
    const weakCell = screen.getByTestId('training-pairs-label-kind-weakly_positive')
    expect(posCell.getAttribute('data-label-kind')).toBe('positive')
    expect(weakCell.getAttribute('data-label-kind')).toBe('weakly_positive')
    // Find the badge span inside each cell — different classes per
    // labelKindBadgeClass dispatch.
    const posBadge = posCell.querySelector('span')
    const weakBadge = weakCell.querySelector('span')
    expect(posBadge?.className).not.toBe(weakBadge?.className)
  })

  it('shows forward-fill caveat when total_pairs is 0', async () => {
    mockStats.mockResolvedValue(statsFixture({ total_pairs: 0 }))
    mockList.mockResolvedValue({ items: [], next_cursor: null, page_size: 50 })

    renderAt('/telemetry/training-pairs')
    await waitFor(() =>
      expect(screen.getByTestId('training-pairs-stats')).toBeInTheDocument(),
    )
    expect(screen.getByTestId('training-pairs-stats')).toHaveTextContent(
      /forward-fill caveat/i,
    )
  })

  it('renders by_query_source and by_action distributions', async () => {
    mockStats.mockResolvedValue(statsFixture())
    mockList.mockResolvedValue({ items: [], next_cursor: null, page_size: 50 })

    renderAt('/telemetry/training-pairs')
    await waitFor(() =>
      expect(screen.getByTestId('training-pairs-stats')).toBeInTheDocument(),
    )
    const qsDist = screen.getByTestId('training-pairs-dist-query_source')
    expect(qsDist).toHaveTextContent('agent_initiated')
    expect(qsDist).toHaveTextContent('98')
    const actDist = screen.getByTestId('training-pairs-dist-action')
    expect(actDist).toHaveTextContent('vault_search')
    expect(actDist).toHaveTextContent('85')
  })
})

describe('TrainingPairsBrowser — filter URL round-trips', () => {
  it('parses repeated label_kind and query_source from URL', async () => {
    mockStats.mockResolvedValue(statsFixture())
    mockList.mockResolvedValue({ items: [], next_cursor: null, page_size: 50 })

    renderAt(
      '/telemetry/training-pairs?label_kind=positive&label_kind=weakly_positive&query_source=agent_initiated',
    )
    await waitFor(() => expect(mockList).toHaveBeenCalled())
    expect(mockList.mock.calls[0][0]).toMatchObject({
      label_kind: ['positive', 'weakly_positive'],
      query_source: ['agent_initiated'],
    })
  })

  it('clicking a label_kind checkbox updates the URL and re-fetches', async () => {
    mockStats.mockResolvedValue(statsFixture())
    mockList.mockResolvedValue({ items: [], next_cursor: null, page_size: 50 })

    renderAt('/telemetry/training-pairs')
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(1))

    fireEvent.click(
      screen.getByTestId('training-pairs-filter-label-kind-positive'),
    )

    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2))
    expect(mockList.mock.calls[1][0]).toMatchObject({
      label_kind: ['positive'],
    })
  })
})

describe('TrainingPairsBrowser — pair list', () => {
  it('renders one card per training-pair item', async () => {
    mockStats.mockResolvedValue(statsFixture())
    mockList.mockResolvedValue({
      items: [
        pairItem({ training_id: 1, label_kind: 'positive' }),
        pairItem({
          training_id: 2,
          label_kind: 'weakly_positive',
          weight: 0.2,
          query_text: 'something mentioned',
          label_sources: ['mentioned'],
        }),
      ],
      next_cursor: null,
      page_size: 50,
    })

    renderAt('/telemetry/training-pairs')
    await waitFor(() =>
      expect(screen.getByTestId('training-pairs-list')).toBeInTheDocument(),
    )
    expect(screen.getByTestId('training-pair-1')).toBeInTheDocument()
    expect(screen.getByTestId('training-pair-2')).toBeInTheDocument()
  })

  it('each card deep-links to /telemetry/trajectories/:groundingEventId', async () => {
    mockStats.mockResolvedValue(statsFixture())
    mockList.mockResolvedValue({
      items: [pairItem({ training_id: 1, grounding_event_id: 42 })],
      next_cursor: null,
      page_size: 50,
    })

    renderAt('/telemetry/training-pairs')
    await waitFor(() =>
      expect(screen.getByTestId('training-pair-1-trajectory')).toBeInTheDocument(),
    )
    const link = screen.getByTestId('training-pair-1-trajectory') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/telemetry/trajectories/42')
  })

  it('empty state when zero items match', async () => {
    mockStats.mockResolvedValue(statsFixture({ total_pairs: 0 }))
    mockList.mockResolvedValue({ items: [], next_cursor: null, page_size: 50 })

    renderAt('/telemetry/training-pairs')
    await waitFor(() =>
      expect(screen.getByTestId('training-pairs-empty')).toBeInTheDocument(),
    )
    expect(screen.getByTestId('training-pairs-empty')).toHaveTextContent(
      /no training pairs match/i,
    )
  })

  it('renders alert on list fetch error', async () => {
    mockStats.mockResolvedValue(statsFixture())
    mockList.mockRejectedValue(new Error('boom'))

    renderAt('/telemetry/training-pairs')
    await waitFor(() =>
      expect(screen.getByTestId('training-pairs-error')).toHaveTextContent('boom'),
    )
  })
})
