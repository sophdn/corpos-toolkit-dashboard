import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getSuccessRate, getVolumeBySource } from '../../api/telemetry'
import type {
  AnalyticsSuccessResponse,
  AnalyticsVolumeResponse,
} from '../../lib/telemetry'
import { TelemetryAnalyticsPage } from '.'

vi.mock('../../api/telemetry', () => ({
  getVolumeBySource: vi.fn(),
  getSuccessRate: vi.fn(),
}))

// ResizeObserver mock — recharts ResponsiveContainer needs it. JSDOM
// doesn't ship one.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as unknown as { ResizeObserver: typeof MockResizeObserver }).ResizeObserver = MockResizeObserver

const mockVolume = vi.mocked(getVolumeBySource)
const mockSuccess = vi.mocked(getSuccessRate)

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/telemetry" element={<TelemetryAnalyticsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const volumeFixture = (
  overrides: Partial<AnalyticsVolumeResponse> = {},
): AnalyticsVolumeResponse => ({
  segment: 'action',
  buckets: [
    {
      day: '2026-05-16',
      segments: { vault_search: 12, kiwix_search: 3 },
    },
    {
      day: '2026-05-17',
      segments: { vault_search: 8, kiwix_search: 5, knowledge_search: 1 },
    },
  ],
  totals_by_segment: { vault_search: 20, kiwix_search: 8, knowledge_search: 1 },
  ...overrides,
})

const successFixture = (
  overrides: Partial<AnalyticsSuccessResponse> = {},
): AnalyticsSuccessResponse => ({
  segment: 'action',
  buckets: [
    {
      day: '2026-05-16',
      segments: {
        vault_search: { query_count: 12, success_count: 9, success_rate: 0.75 },
      },
    },
  ],
  totals_by_segment: {
    vault_search: { query_count: 12, success_count: 9, success_rate: 0.75 },
  },
  ...overrides,
})

beforeEach(() => {
  mockVolume.mockReset()
  mockSuccess.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('TelemetryAnalyticsPage — segment toggle + URL state', () => {
  it('defaults to segment=action when URL has no seg param', async () => {
    mockVolume.mockResolvedValue(volumeFixture())
    mockSuccess.mockResolvedValue(successFixture())

    renderAt('/telemetry')

    await waitFor(() => expect(mockVolume).toHaveBeenCalled())
    expect(mockVolume.mock.calls[0][0].segment).toBe('action')
    expect(mockSuccess.mock.calls[0][0].segment).toBe('action')

    const actionRadio = screen.getByTestId('telemetry-segment-action') as HTMLInputElement
    expect(actionRadio.checked).toBe(true)
  })

  it('honors seg=query_source from the URL', async () => {
    mockVolume.mockResolvedValue(volumeFixture({ segment: 'query_source' }))
    mockSuccess.mockResolvedValue(successFixture({ segment: 'query_source' }))

    renderAt('/telemetry?seg=query_source')

    await waitFor(() => expect(mockVolume).toHaveBeenCalled())
    expect(mockVolume.mock.calls[0][0].segment).toBe('query_source')
    const sourceRadio = screen.getByTestId('telemetry-segment-query_source') as HTMLInputElement
    expect(sourceRadio.checked).toBe(true)
  })

  it('clicking the alt segment toggle re-fetches with the new axis', async () => {
    mockVolume.mockResolvedValue(volumeFixture())
    mockSuccess.mockResolvedValue(successFixture())

    renderAt('/telemetry')
    await waitFor(() => expect(mockVolume).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByTestId('telemetry-segment-query_source'))

    await waitFor(() => expect(mockVolume).toHaveBeenCalledTimes(2))
    expect(mockVolume.mock.calls[1][0].segment).toBe('query_source')
    expect(mockSuccess.mock.calls[1][0].segment).toBe('query_source')
  })

  it('round-trips since/until from URL into the API call', async () => {
    mockVolume.mockResolvedValue(volumeFixture())
    mockSuccess.mockResolvedValue(successFixture())

    renderAt('/telemetry?seg=action&since=2026-04-01&until=2026-04-30&project=mcp-servers')

    await waitFor(() => expect(mockVolume).toHaveBeenCalled())
    expect(mockVolume.mock.calls[0][0]).toEqual({
      segment: 'action',
      since: '2026-04-01',
      until: '2026-04-30',
      project: 'mcp-servers',
    })
  })
})

describe('TelemetryAnalyticsPage — rendering states', () => {
  it('renders charts when data arrives', async () => {
    mockVolume.mockResolvedValue(volumeFixture())
    mockSuccess.mockResolvedValue(successFixture())

    renderAt('/telemetry')
    await waitFor(() =>
      expect(screen.getByTestId('telemetry-volume-chart')).toBeInTheDocument(),
    )
    expect(screen.getByTestId('telemetry-success-chart')).toBeInTheDocument()
  })

  it('renders empty-state copy when no buckets returned', async () => {
    mockVolume.mockResolvedValue(volumeFixture({ buckets: [], totals_by_segment: {} }))
    mockSuccess.mockResolvedValue(successFixture({ buckets: [], totals_by_segment: {} }))

    renderAt('/telemetry')
    await waitFor(() =>
      expect(screen.getByTestId('telemetry-volume-empty')).toBeInTheDocument(),
    )
    expect(screen.getByTestId('telemetry-success-empty')).toBeInTheDocument()
    // Empty-state is a non-empty body (not 204) — copy explains the
    // narrow filter / forward-fill caveat.
    expect(screen.getByTestId('telemetry-volume-empty')).toHaveTextContent(
      /no queries in this time range/i,
    )
  })

  it('renders an alert when the volume fetch fails', async () => {
    mockVolume.mockRejectedValue(new Error('boom'))
    mockSuccess.mockResolvedValue(successFixture())

    renderAt('/telemetry')
    await waitFor(() =>
      expect(screen.getByTestId('telemetry-volume-error')).toHaveTextContent('boom'),
    )
  })
})

describe('TelemetryAnalyticsPage — forward-fill caveat', () => {
  // Real observed shape: 75 grounding_events but 0 query_interactions
  // because the Stop hook that detects click signals isn't wired. Every
  // segment shows 0% success and the operator can't tell the chart from
  // "everything failed."
  it('shows forward-fill caveat when all success rates are 0 but queries exist', async () => {
    mockVolume.mockResolvedValue(volumeFixture())
    mockSuccess.mockResolvedValue(
      successFixture({
        buckets: [
          {
            day: '2026-05-17',
            segments: {
              vault_search: { query_count: 75, success_count: 0, success_rate: 0 },
              kiwix_search: { query_count: 5, success_count: 0, success_rate: 0 },
            },
          },
        ],
        totals_by_segment: {
          vault_search: { query_count: 75, success_count: 0, success_rate: 0 },
          kiwix_search: { query_count: 5, success_count: 0, success_rate: 0 },
        },
      }),
    )

    renderAt('/telemetry')
    await waitFor(() =>
      expect(
        screen.getByTestId('telemetry-success-forward-fill-caveat'),
      ).toBeInTheDocument(),
    )
    // Copy names the diagnostic (click detection) AND the workaround
    // for the false-positive case (narrow the range).
    const caveat = screen.getByTestId('telemetry-success-forward-fill-caveat')
    expect(caveat).toHaveTextContent(/click-detection/i)
    expect(caveat).toHaveTextContent(/query_interactions/i)
  })

  it('does NOT show the caveat when at least one segment has a non-zero rate', async () => {
    mockVolume.mockResolvedValue(volumeFixture())
    mockSuccess.mockResolvedValue(
      successFixture({
        buckets: [
          {
            day: '2026-05-17',
            segments: {
              vault_search: { query_count: 12, success_count: 9, success_rate: 0.75 },
            },
          },
        ],
        totals_by_segment: {
          vault_search: { query_count: 12, success_count: 9, success_rate: 0.75 },
        },
      }),
    )

    renderAt('/telemetry')
    await waitFor(() =>
      expect(screen.getByTestId('telemetry-success-chart')).toBeInTheDocument(),
    )
    expect(
      screen.queryByTestId('telemetry-success-forward-fill-caveat'),
    ).not.toBeInTheDocument()
  })

  it('does NOT show the caveat when there are zero queries (empty-state takes over)', async () => {
    mockVolume.mockResolvedValue(volumeFixture({ buckets: [], totals_by_segment: {} }))
    mockSuccess.mockResolvedValue(successFixture({ buckets: [], totals_by_segment: {} }))

    renderAt('/telemetry')
    await waitFor(() =>
      expect(screen.getByTestId('telemetry-success-empty')).toBeInTheDocument(),
    )
    expect(
      screen.queryByTestId('telemetry-success-forward-fill-caveat'),
    ).not.toBeInTheDocument()
  })
})

describe('TelemetryAnalyticsPage — three-axis discipline', () => {
  it('chart heading names which axis the slice is on', async () => {
    mockVolume.mockResolvedValue(volumeFixture())
    mockSuccess.mockResolvedValue(successFixture())

    renderAt('/telemetry?seg=query_source')
    await waitFor(() =>
      expect(screen.getByTestId('telemetry-volume-card')).toBeInTheDocument(),
    )
    const volumeCard = screen.getByTestId('telemetry-volume-card')
    expect(volumeCard).toHaveTextContent(/by query_source/i)
    const successCard = screen.getByTestId('telemetry-success-card')
    expect(successCard).toHaveTextContent(/by query_source/i)
  })

  // The legend MUST NOT hardcode action / query_source values. The
  // chart reads segments from the response's totals_by_segment keys.
  // Pin this with an aria-label assertion (set by the chart wrap) +
  // verify the chart wrap renders even for novel segment values —
  // recharts SVG paint requires real layout dimensions that JSDOM
  // doesn't provide, so the SVG itself isn't asserted here.
  it('chart wrap renders for novel future segment values without code change', async () => {
    mockVolume.mockResolvedValue(
      volumeFixture({
        segment: 'query_source',
        buckets: [
          {
            day: '2026-05-16',
            segments: { reference_resolution: 5, toolsearch_rerank: 2 },
          },
        ],
        totals_by_segment: { reference_resolution: 5, toolsearch_rerank: 2 },
      }),
    )
    mockSuccess.mockResolvedValue(successFixture({ segment: 'query_source' }))

    renderAt('/telemetry?seg=query_source')
    await waitFor(() =>
      expect(screen.getByTestId('telemetry-volume-chart')).toBeInTheDocument(),
    )
    // aria-label is set from data.segment, not from a hardcoded enum —
    // forward-compat with future axes is structural.
    const chart = screen.getByTestId('telemetry-volume-chart')
    expect(chart.getAttribute('aria-label')).toMatch(/query volume by query_source/i)
  })
})
