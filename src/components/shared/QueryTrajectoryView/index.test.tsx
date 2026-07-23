import { render, screen, waitFor, act, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getAuditEvent } from '../../../api/auditEvents'
import {
  getTrajectoryByQueryId,
  getTrajectoryBySpanId,
} from '../../../api/telemetry'
import type { AuditEventDetail } from '../../../lib/auditEvents'
import type {
  TrajectoryInteraction,
  TrajectoryResolution,
  TrajectoryResponse,
  TrajectoryResult,
} from '../../../lib/telemetry'
import { QueryTrajectoryView } from '.'

vi.mock('../../../api/telemetry', () => ({
  getTrajectoryByQueryId: vi.fn(),
  getTrajectoryBySpanId: vi.fn(),
}))
vi.mock('../../../api/auditEvents', () => ({
  getAuditEvent: vi.fn(),
}))

const mockByQuery = vi.mocked(getTrajectoryByQueryId)
const mockBySpan = vi.mocked(getTrajectoryBySpanId)
const mockGetEvent = vi.mocked(getAuditEvent)

const baseQuery = (
  overrides: Partial<TrajectoryResponse['query']> = {},
): TrajectoryResponse['query'] => ({
  query_id: 42,
  span_id: '0190f8a3-7b21-7c64-9d83-1f44a2b18cde',
  prompt_id: 'prompt-1',
  session_id: 'sess-1',
  parent_span_id: null,
  project_id: 'mcp-servers',
  action: 'vault_search',
  query_source: 'agent_initiated',
  query_text: 'telemetry projection rebuild semantics',
  results_count: 2,
  created_at: '2026-05-17T14:32:00.123Z',
  ...overrides,
})

const baseResult = (
  overrides: Partial<TrajectoryResult> = {},
): TrajectoryResult => ({
  position: 1,
  source_ref: 'learnings/mcp-servers/foo.md',
  source_type: 'vault',
  candidate_pointer_id: 100,
  ...overrides,
})

const baseInteraction = (
  overrides: Partial<TrajectoryInteraction> = {},
): TrajectoryInteraction => ({
  interaction_id: 1,
  source_ref: 'learnings/mcp-servers/foo.md',
  position: 1,
  click_kind: 'followed',
  click_weight: 1.0,
  citation_kind: null,
  dwell_ms_estimate: null,
  was_injected: 0,
  detected_at: '2026-05-17T14:33:00.000Z',
  ...overrides,
})

const baseResolution = (
  overrides: Partial<TrajectoryResolution> = {},
): TrajectoryResolution => ({
  resolution_id: 'reso-1',
  entity_kind: 'task',
  entity_slug: 'reshape-projection',
  entity_project_id: 'mcp-servers',
  outcome_kind: 'completed',
  write_event_ids: [],
  detected_at: '2026-05-17T14:35:00.000Z',
  ...overrides,
})

const baseTrajectory = (
  overrides: Partial<TrajectoryResponse> = {},
): TrajectoryResponse => ({
  query: baseQuery(),
  results: [baseResult()],
  interactions: [baseInteraction()],
  resolutions: [baseResolution()],
  ...overrides,
})

beforeEach(() => {
  mockByQuery.mockReset()
  mockBySpan.mockReset()
  mockGetEvent.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

// --- loading / error / empty -----------------------------------------

describe('QueryTrajectoryView — loading / error / empty states', () => {
  it('renders the loading placeholder while the fetch is in flight', async () => {
    let resolve!: (v: TrajectoryResponse) => void
    mockByQuery.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r
      }),
    )
    render(<QueryTrajectoryView queryId={42} />)
    expect(screen.getByTestId('trajectory-loading')).toBeInTheDocument()
    await act(async () => {
      resolve(baseTrajectory())
    })
  })

  it('renders an alert when the fetch fails', async () => {
    mockByQuery.mockRejectedValueOnce(new Error('boom'))
    render(<QueryTrajectoryView queryId={42} />)
    await waitFor(() =>
      expect(screen.getByTestId('trajectory-error')).toHaveTextContent('boom'),
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('renders the empty state when span lookup returns no trajectories', async () => {
    mockBySpan.mockResolvedValueOnce({ trajectories: [] })
    render(<QueryTrajectoryView spanId="0190f8a3-aaaa-7000-8000-000000000000" />)
    await waitFor(() =>
      expect(screen.getByTestId('trajectory-empty')).toBeInTheDocument(),
    )
  })
})

// --- four sections + three-axis disambiguation -----------------------

describe('QueryTrajectoryView — section rendering', () => {
  it('renders all four sections — query, results, interactions, resolutions', async () => {
    mockByQuery.mockResolvedValueOnce(baseTrajectory())
    render(<QueryTrajectoryView queryId={42} />)
    await waitFor(() =>
      expect(screen.getByTestId('trajectory')).toBeInTheDocument(),
    )
    expect(screen.getByTestId('trajectory-query-header')).toBeInTheDocument()
    expect(screen.getByTestId('trajectory-results')).toBeInTheDocument()
    expect(screen.getByTestId('trajectory-interactions')).toBeInTheDocument()
    expect(screen.getByTestId('trajectory-resolutions')).toBeInTheDocument()
  })

  it('renders action and query_source as distinct chips (NOT collapsed)', async () => {
    mockByQuery.mockResolvedValueOnce(baseTrajectory())
    render(<QueryTrajectoryView queryId={42} />)
    await waitFor(() =>
      expect(screen.getByTestId('trajectory-action')).toBeInTheDocument(),
    )
    const action = screen.getByTestId('trajectory-action')
    const source = screen.getByTestId('trajectory-query-source')
    expect(action).toHaveTextContent('vault_search')
    expect(source).toHaveTextContent('agent_initiated')
    // Three-axis discipline: chip titles must explicitly label which
    // axis they represent so a visual review catches conflation.
    expect(action.getAttribute('title')).toMatch(/action/)
    expect(source.getAttribute('title')).toMatch(/query_source/)
  })

  it('dispatches per-result source_type chips for each knowledge_pointer kind', async () => {
    mockByQuery.mockResolvedValueOnce(
      baseTrajectory({
        results: [
          baseResult({ position: 1, source_type: 'vault', source_ref: 'v/a' }),
          baseResult({ position: 2, source_type: 'kiwix', source_ref: 'k/a' }),
          baseResult({ position: 3, source_type: 'library', source_ref: 'l/a' }),
          baseResult({ position: 4, source_type: 'task', source_ref: 't/a' }),
          baseResult({ position: 5, source_type: 'chain', source_ref: 'c/a' }),
          baseResult({ position: 6, source_type: 'bug', source_ref: 'b/a' }),
        ],
      }),
    )
    render(<QueryTrajectoryView queryId={42} />)
    await waitFor(() =>
      expect(screen.getByTestId('trajectory-results')).toBeInTheDocument(),
    )
    // Each result row carries a data-source-type attribute matching
    // exactly the source_type axis (not query_source / action).
    const chips = screen.getAllByTestId('trajectory-result-source-type')
    const types = chips.map((c) => c.getAttribute('data-source-type'))
    expect(types).toEqual(['vault', 'kiwix', 'library', 'task', 'chain', 'bug'])
  })

  it('falls back to "unknown" chip when source_type is null', async () => {
    mockByQuery.mockResolvedValueOnce(
      baseTrajectory({
        results: [baseResult({ source_type: null })],
      }),
    )
    render(<QueryTrajectoryView queryId={42} />)
    await waitFor(() =>
      expect(screen.getByTestId('trajectory-results')).toBeInTheDocument(),
    )
    const chip = screen.getByTestId('trajectory-result-source-type')
    expect(chip.getAttribute('data-source-type')).toBe('unknown')
  })
})

// --- click_kind tier completeness ------------------------------------

describe('QueryTrajectoryView — click_kind tier rendering', () => {
  it('renders all four tier subsections even when only one tier fires', async () => {
    mockByQuery.mockResolvedValueOnce(baseTrajectory())
    render(<QueryTrajectoryView queryId={42} />)
    await waitFor(() =>
      expect(screen.getByTestId('trajectory-interactions')).toBeInTheDocument(),
    )
    expect(screen.getByTestId('trajectory-tier-followed')).toBeInTheDocument()
    expect(screen.getByTestId('trajectory-tier-cited')).toBeInTheDocument()
    expect(screen.getByTestId('trajectory-tier-mentioned')).toBeInTheDocument()
    expect(screen.getByTestId('trajectory-tier-resolved-from')).toBeInTheDocument()
    // The three tiers that didn't fire surface the "no <tier> signals"
    // copy rather than being hidden.
    expect(screen.getByTestId('trajectory-tier-cited-empty')).toHaveTextContent(/no cited signals/i)
    expect(screen.getByTestId('trajectory-tier-mentioned-empty')).toHaveTextContent(/no mentioned signals/i)
    expect(screen.getByTestId('trajectory-tier-resolved-from-empty')).toHaveTextContent(/no resolved-from signals/i)
  })

  // Bug-AC: tier-row count equals SUM(per-tier rows). Multiple tiers
  // firing for the same (span_id, source_ref) produce multiple rows;
  // no deduplication. TT1 §5.1.
  it('renders one row per (span_id, source_ref, click_kind) — no dedup', async () => {
    mockByQuery.mockResolvedValueOnce(
      baseTrajectory({
        interactions: [
          baseInteraction({
            interaction_id: 1,
            source_ref: 'shared-ref',
            click_kind: 'followed',
            click_weight: 1.0,
          }),
          baseInteraction({
            interaction_id: 2,
            source_ref: 'shared-ref',
            click_kind: 'cited',
            click_weight: 0.8,
          }),
          baseInteraction({
            interaction_id: 3,
            source_ref: 'shared-ref',
            click_kind: 'resolved-from',
            click_weight: 1.0,
          }),
        ],
      }),
    )
    render(<QueryTrajectoryView queryId={42} />)
    await waitFor(() =>
      expect(screen.getByTestId('trajectory-interactions')).toBeInTheDocument(),
    )
    expect(screen.getByTestId('trajectory-interaction-1')).toBeInTheDocument()
    expect(screen.getByTestId('trajectory-interaction-2')).toBeInTheDocument()
    expect(screen.getByTestId('trajectory-interaction-3')).toBeInTheDocument()
    // Three tier blocks have rows (followed, cited, resolved-from);
    // 'mentioned' shows empty.
    expect(
      within(screen.getByTestId('trajectory-tier-followed')).getByTestId('trajectory-interaction-1'),
    ).toBeInTheDocument()
    expect(
      within(screen.getByTestId('trajectory-tier-cited')).getByTestId('trajectory-interaction-2'),
    ).toBeInTheDocument()
    expect(
      within(screen.getByTestId('trajectory-tier-resolved-from')).getByTestId('trajectory-interaction-3'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('trajectory-tier-mentioned-empty')).toBeInTheDocument()
  })
})

// --- resolutions + per-event-type renderer reuse ---------------------

describe('QueryTrajectoryView — resolution rendering and per-event reuse', () => {
  it('renders the resolution header (entity_kind / entity_slug / outcome_kind)', async () => {
    mockByQuery.mockResolvedValueOnce(
      baseTrajectory({
        resolutions: [
          baseResolution({
            resolution_id: 'reso-7',
            entity_kind: 'bug',
            entity_slug: 'flaky-test',
            outcome_kind: 'resolved',
          }),
        ],
      }),
    )
    render(<QueryTrajectoryView queryId={42} />)
    await waitFor(() =>
      expect(screen.getByTestId('trajectory-resolution-reso-7')).toBeInTheDocument(),
    )
    const row = screen.getByTestId('trajectory-resolution-reso-7')
    expect(row).toHaveTextContent('bug')
    expect(row).toHaveTextContent('flaky-test')
    expect(row).toHaveTextContent('resolved')
  })

  it('hydrates write_event_ids via getAuditEvent and dispatches to renderEventPayload', async () => {
    const evt: AuditEventDetail = {
      event_id: 'evt-1',
      ts: '2026-05-17T14:35:00.000Z',
      actor: { kind: 'agent', id: 'claude-opus-4-7' },
      type: 'BugResolved',
      entity: { kind: 'bug', slug: 'the-bug', project_id: 'mcp-servers' },
      payload: { kind: 'fixed', commit_sha: 'abc1234' },
      rationale: null,
      caused_by_event_id: null,
      related_entities: [],
      span_id: '00000000-0000-4000-8000-000000000000',
      schema_version: 1,
      related_queries: null,
    }
    mockGetEvent.mockResolvedValueOnce(evt)
    mockByQuery.mockResolvedValueOnce(
      baseTrajectory({
        resolutions: [
          baseResolution({ write_event_ids: ['evt-1'] }),
        ],
      }),
    )

    render(<QueryTrajectoryView queryId={42} />)
    await waitFor(() =>
      expect(screen.getByTestId('trajectory-event-evt-1')).toBeInTheDocument(),
    )
    // The BugResolved renderer surfaces commit_sha.
    expect(screen.getByTestId('trajectory-event-evt-1')).toHaveTextContent('abc1234')
  })

  it('falls back gracefully when getAuditEvent errors (substrate-frontend absent)', async () => {
    mockGetEvent.mockRejectedValueOnce(new Error('not deployed'))
    mockByQuery.mockResolvedValueOnce(
      baseTrajectory({
        resolutions: [
          baseResolution({ write_event_ids: ['evt-missing'] }),
        ],
      }),
    )
    render(<QueryTrajectoryView queryId={42} />)
    await waitFor(() =>
      expect(
        screen.getByTestId('trajectory-event-evt-missing-fallback'),
      ).toHaveTextContent(/fetch failed/i),
    )
  })
})

// --- span deep-link --------------------------------------------------

describe('QueryTrajectoryView — span deep-link', () => {
  it('renders a span link with clipboard-copy fallback shape', async () => {
    mockByQuery.mockResolvedValueOnce(baseTrajectory())
    render(<QueryTrajectoryView queryId={42} />)
    await waitFor(() =>
      expect(screen.getByTestId('trajectory-span-link')).toBeInTheDocument(),
    )
    const link = screen.getByTestId('trajectory-span-link') as HTMLAnchorElement
    expect(link.getAttribute('href')).toContain('/spans?span_id=')
    expect(link.getAttribute('href')).toContain('0190f8a3-7b21-7c64-9d83-1f44a2b18cde')
  })
})

// --- span_id fetcher selection ---------------------------------------

describe('QueryTrajectoryView — fetcher selection', () => {
  it('calls getTrajectoryBySpanId when spanId is provided', async () => {
    mockBySpan.mockResolvedValueOnce({ trajectories: [baseTrajectory()] })
    render(<QueryTrajectoryView spanId="0190f8a3-aaaa-7000-8000-000000000000" />)
    await waitFor(() =>
      expect(mockBySpan).toHaveBeenCalledWith(
        '0190f8a3-aaaa-7000-8000-000000000000',
        expect.anything(),
      ),
    )
    expect(mockByQuery).not.toHaveBeenCalled()
  })

  it('calls getTrajectoryByQueryId when queryId is provided', async () => {
    mockByQuery.mockResolvedValueOnce(baseTrajectory())
    render(<QueryTrajectoryView queryId={42} />)
    await waitFor(() =>
      expect(mockByQuery).toHaveBeenCalledWith(42, expect.anything()),
    )
    expect(mockBySpan).not.toHaveBeenCalled()
  })
})
