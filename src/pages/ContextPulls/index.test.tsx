import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getContextPullDetail,
  getContextPullStats,
  getContextPullsTimeseries,
  listContextPulls,
} from '../../api/contextPulls'
import type {
  ContextPullDetail,
  ContextPullListResponse,
  ContextPullRow,
  ContextPullStatsResponse,
  ContextPullsTimeseriesResponse,
} from '../../lib/contextPulls'
import { ContextPullInspector } from '.'

vi.mock('../../api/contextPulls', () => ({
  listContextPulls: vi.fn(),
  getContextPullDetail: vi.fn(),
  getContextPullStats: vi.fn(),
  getContextPullsTimeseries: vi.fn(),
  listContextPullsByEntity: vi.fn(),
}))

// recharts ResponsiveContainer needs ResizeObserver; JSDOM doesn't ship one.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as unknown as {
  ResizeObserver: typeof MockResizeObserver
}).ResizeObserver = MockResizeObserver

const mockList = vi.mocked(listContextPulls)
const mockDetail = vi.mocked(getContextPullDetail)
const mockStats = vi.mocked(getContextPullStats)
const mockTimeseries = vi.mocked(getContextPullsTimeseries)

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/context-pulls" element={<ContextPullInspector />} />
      </Routes>
    </MemoryRouter>,
  )
}

function row(overrides: Partial<ContextPullRow> = {}): ContextPullRow {
  return {
    grounding_event_id: 100,
    ts: '2026-05-19T12:00:00.000Z',
    project_id: 'mcp-servers',
    session_id: 'sess-1',
    prompt_id: 'prompt-1',
    span_id: 'span-1',
    parent_span_id: null,
    action: 'resolve_references',
    query_source: 'reference_resolution',
    query_text: 'look at cap-test',
    shape: 'chain_slug',
    confidence_tier: 'single_exact',
    presentation_recommendation: 'use_directly',
    presented_as: '`cap-test` → chain in mcp-servers',
    results_count: 1,
    first_candidate: {
      source_ref: 'chain:cap-test',
      source_type: 'chain',
      position: 1,
    },
    click_kinds_fired: ['cited'],
    ml_confidence_score: null,
    ...overrides,
  }
}

function emptyStats(): ContextPullStatsResponse {
  return {
    total_references: 0,
    by_shape: {},
    by_confidence_tier: {
      single_exact: 0,
      fuzzy_multi: 0,
      weak_domain: 0,
      no_hit: 0,
    },
    by_source_type: {},
    by_query_source: {},
  }
}

function populatedStats(): ContextPullStatsResponse {
  return {
    total_references: 12,
    by_shape: { chain_slug: 7, domain_term: 5 },
    by_confidence_tier: {
      single_exact: 9,
      fuzzy_multi: 2,
      weak_domain: 1,
      no_hit: 0,
    },
    by_source_type: { chain: 7, vault: 5 },
    by_query_source: { reference_resolution: 12 },
  }
}

function emptyTimeseries(): ContextPullsTimeseriesResponse {
  return { segment: 'shape', buckets: [] }
}

function emptyList(): ContextPullListResponse {
  return {
    items: [],
    next_cursor: null,
    page_size: 50,
    available_query_sources: ['reference_resolution', 'agent_initiated'],
    available_shapes: ['chain_slug', 'domain_term'],
    available_confidence_tiers: ['single_exact', 'weak_domain'],
    available_source_types: ['vault', 'chain'],
  }
}

beforeEach(() => {
  mockList.mockReset()
  mockDetail.mockReset()
  mockStats.mockReset()
  mockTimeseries.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('ContextPullInspector — list', () => {
  it('renders seeded rows with shape + tier badges and first_candidate', async () => {
    mockStats.mockResolvedValue(populatedStats())
    mockTimeseries.mockResolvedValue(emptyTimeseries())
    mockList.mockResolvedValue({
      ...emptyList(),
      items: [row()],
    })

    renderAt('/context-pulls')
    await waitFor(() =>
      expect(
        screen.getByTestId('context-pulls-row-100'),
      ).toBeInTheDocument(),
    )
    expect(
      screen.getByTestId('context-pulls-shape-chain_slug'),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('context-pulls-confidence-single_exact'),
    ).toBeInTheDocument()
  })

  it('renders the genuinely-empty copy when no rows and no filters', async () => {
    mockStats.mockResolvedValue(emptyStats())
    mockTimeseries.mockResolvedValue(emptyTimeseries())
    mockList.mockResolvedValue(emptyList())

    renderAt('/context-pulls')
    await waitFor(() =>
      expect(
        screen.getByTestId('context-pulls-empty'),
      ).toBeInTheDocument(),
    )
    expect(screen.getByTestId('context-pulls-empty')).toHaveTextContent(
      /No reference resolutions recorded yet/i,
    )
  })

  it('renders the filter-narrowed copy when filters are active and result is empty', async () => {
    mockStats.mockResolvedValue(populatedStats())
    mockTimeseries.mockResolvedValue(emptyTimeseries())
    mockList.mockResolvedValue(emptyList())

    renderAt('/context-pulls?shape=domain_term')
    await waitFor(() =>
      expect(
        screen.getByTestId('context-pulls-empty'),
      ).toBeInTheDocument(),
    )
    expect(screen.getByTestId('context-pulls-empty')).toHaveTextContent(
      /No reference resolutions match the current filters/i,
    )
  })

  it('renders the pre-amendment banner when total > 0 but every shape bucket is empty', async () => {
    // The fourth empty-state shape (the vault learning's three did not
    // anticipate this): rows exist but predate the side-table amendment
    // — by_shape is empty / all-zero, distinguishing from genuine no-data
    // and from filter-narrows-to-zero.
    mockStats.mockResolvedValue({
      total_references: 84,
      by_shape: {},
      by_confidence_tier: {
        single_exact: 0,
        fuzzy_multi: 0,
        weak_domain: 0,
        no_hit: 0,
      },
      by_source_type: {},
      by_query_source: { reference_resolution: 84 },
    })
    mockTimeseries.mockResolvedValue(emptyTimeseries())
    mockList.mockResolvedValue(emptyList())

    renderAt('/context-pulls')
    await waitFor(() =>
      expect(
        screen.getByTestId('context-pulls-pre-amendment-banner'),
      ).toBeInTheDocument(),
    )
    expect(
      screen.getByTestId('context-pulls-pre-amendment-banner'),
    ).toHaveTextContent(/migration 042/i)
    expect(
      screen.getByTestId('context-pulls-pre-amendment-banner'),
    ).toHaveTextContent(/mcp reconnect/i)
  })

  it('does NOT render the pre-amendment banner when shape buckets have data', async () => {
    mockStats.mockResolvedValue(populatedStats())
    mockTimeseries.mockResolvedValue(emptyTimeseries())
    mockList.mockResolvedValue(emptyList())

    renderAt('/context-pulls')
    await waitFor(() =>
      expect(screen.getByTestId('context-pulls-stats')).toBeInTheDocument(),
    )
    expect(
      screen.queryByTestId('context-pulls-pre-amendment-banner'),
    ).not.toBeInTheDocument()
  })

  it('renders the forward-fill caveat note in stats banner when total is zero', async () => {
    mockStats.mockResolvedValue(emptyStats())
    mockTimeseries.mockResolvedValue(emptyTimeseries())
    mockList.mockResolvedValue(emptyList())

    renderAt('/context-pulls')
    await waitFor(() =>
      expect(screen.getByTestId('context-pulls-stats')).toBeInTheDocument(),
    )
    expect(screen.getByTestId('context-pulls-stats')).toHaveTextContent(
      /substrate may be empty/i,
    )
    // The migration land time MUST appear so the operator knows what
    // "wired" looks like vs "no data yet" (forward-fill caveat copy).
    expect(screen.getByTestId('context-pulls-stats')).toHaveTextContent(
      /migration 040/i,
    )
  })
})

describe('ContextPullInspector — filter URL round-trip', () => {
  it('round-trips shape and confidence_tier filters', async () => {
    mockStats.mockResolvedValue(populatedStats())
    mockTimeseries.mockResolvedValue(emptyTimeseries())
    mockList.mockResolvedValue(emptyList())

    renderAt('/context-pulls?shape=chain_slug&confidence_tier=weak_domain')
    await waitFor(() => expect(mockList).toHaveBeenCalled())
    const callArgs = mockList.mock.calls[mockList.mock.calls.length - 1][0]
    expect(callArgs?.shape).toEqual(['chain_slug'])
    expect(callArgs?.confidence_tier).toEqual(['weak_domain'])
  })

  it('clear-filters button removes all filters from the URL', async () => {
    mockStats.mockResolvedValue(populatedStats())
    mockTimeseries.mockResolvedValue(emptyTimeseries())
    mockList.mockResolvedValue({ ...emptyList(), items: [row()] })

    renderAt('/context-pulls?shape=chain_slug')
    await waitFor(() =>
      expect(
        screen.getByTestId('context-pulls-clear-filters'),
      ).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByTestId('context-pulls-clear-filters'))
    await waitFor(() => {
      // After clear, the list re-fetches with no filters applied.
      const last = mockList.mock.calls[mockList.mock.calls.length - 1][0]
      expect(last?.shape).toBeUndefined()
    })
  })
})

describe('ContextPullInspector — ML confidence score', () => {
  it('renders — for null ml_confidence_score (T7 not yet shipped)', async () => {
    mockStats.mockResolvedValue(populatedStats())
    mockTimeseries.mockResolvedValue(emptyTimeseries())
    mockList.mockResolvedValue({
      ...emptyList(),
      items: [row({ ml_confidence_score: null })],
    })

    renderAt('/context-pulls')
    await waitFor(() =>
      expect(screen.getByTestId('context-pulls-ml-absent')).toBeInTheDocument(),
    )
  })

  it('renders the numeric score when ml_confidence_score is populated', async () => {
    mockStats.mockResolvedValue(populatedStats())
    mockTimeseries.mockResolvedValue(emptyTimeseries())
    mockList.mockResolvedValue({
      ...emptyList(),
      items: [row({ ml_confidence_score: 0.83 })],
    })

    renderAt('/context-pulls')
    await waitFor(() =>
      expect(
        screen.getByTestId('context-pulls-ml-present'),
      ).toBeInTheDocument(),
    )
    expect(screen.getByTestId('context-pulls-ml-present')).toHaveTextContent(
      '0.83',
    )
  })
})

describe('ContextPullInspector — harness reminder panel', () => {
  it('does NOT render when query_source filter is reference_resolution only (default)', async () => {
    mockStats.mockResolvedValue(populatedStats())
    mockTimeseries.mockResolvedValue(emptyTimeseries())
    mockList.mockResolvedValue(emptyList())

    renderAt('/context-pulls')
    await waitFor(() =>
      expect(screen.getByTestId('context-pulls-stats')).toBeInTheDocument(),
    )
    expect(
      screen.queryByTestId('context-pulls-harness-panel'),
    ).not.toBeInTheDocument()
  })

  it('renders when query_source filter admits harness_reminder_interception', async () => {
    mockStats.mockResolvedValue(populatedStats())
    mockTimeseries.mockResolvedValue(emptyTimeseries())
    mockList.mockResolvedValue(emptyList())

    renderAt(
      '/context-pulls?query_source=harness_reminder_interception',
    )
    await waitFor(() =>
      expect(
        screen.getByTestId('context-pulls-harness-panel'),
      ).toBeInTheDocument(),
    )
  })
})

describe('ContextPullInspector — drawer', () => {
  it('opens the drawer with detail content when ?event=<id> is set', async () => {
    mockStats.mockResolvedValue(populatedStats())
    mockTimeseries.mockResolvedValue(emptyTimeseries())
    mockList.mockResolvedValue({ ...emptyList(), items: [row()] })
    const detail: ContextPullDetail = {
      grounding_event: {
        id: 100,
        ts: '2026-05-19T12:00:00.000Z',
        project_id: 'mcp-servers',
        session_id: 'sess-1',
        prompt_id: 'prompt-1',
        span_id: 'span-1',
        parent_span_id: null,
        action: 'resolve_references',
        query_source: 'reference_resolution',
        user_message_id: null,
        results_count: 1,
      },
      detection: {
        token: 'cap-test',
        shape: 'chain_slug',
        confidence: 1.0,
        detection_method: 'regex+list_match',
        start_pos: 8,
        end_pos: 16,
        source_message_excerpt: null,
      },
      resolver: { name: 'chainResolver', retrieval_cost_ms: 5, err: null },
      candidates: [
        {
          position: 1,
          source_ref: 'chain:cap-test',
          source_type: 'chain',
          title: null,
          score: null,
          debug_notes: null,
          ml_confidence_score: null,
        },
      ],
      outcome: {
        confidence_tier: 'single_exact',
        presentation_recommendation: 'use_directly',
        presented_as: '`cap-test` → chain in mcp-servers',
      },
      interactions: [],
      linked_resolutions: [],
      trajectory_deep_link: '/telemetry/trajectories/100',
    }
    mockDetail.mockResolvedValue(detail)

    renderAt('/context-pulls?event=100')
    await waitFor(() =>
      expect(screen.getByTestId('context-pulls-drawer')).toBeInTheDocument(),
    )
    expect(
      screen.getByTestId('context-pulls-drawer-detection'),
    ).toHaveTextContent('cap-test')
    // Forward-fill caveat copy renders when source_message_excerpt is null.
    expect(
      screen.getByTestId('context-pulls-drawer-excerpt-absent'),
    ).toBeInTheDocument()
    // QF3 deep-link is the cross-substrate cross-link (not embed).
    expect(
      screen.getByTestId('context-pulls-drawer-trajectory-link'),
    ).toHaveAttribute('href', '/telemetry/trajectories/100')
  })
})
