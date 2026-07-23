import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getAuditEvent, listAuditEvents } from '../../api/auditEvents'
import type { AuditEvent, AuditEventDetail } from '../../lib/auditEvents'
import { AuditLedgerPage, entityTimelinePath } from '.'

vi.mock('../../api/auditEvents', () => ({
  listAuditEvents: vi.fn(),
  getAuditEvent: vi.fn(),
}))
// useEventBus is exercised separately; stub it here to keep SSE noise out
// of the deterministic table-rendering tests.
vi.mock('../../hooks/useEventBus', () => ({
  useEventBus: vi.fn(),
}))

const mockList = vi.mocked(listAuditEvents)
const mockGet = vi.mocked(getAuditEvent)

const evt = (overrides: Partial<AuditEvent> = {}): AuditEvent => ({
  event_id: '0190f8a3-7b21-7c64-9d83-1f44a2b18001',
  ts: '2026-05-17T12:00:00.000Z',
  actor: { kind: 'agent', id: 'claude-opus-4-7' },
  type: 'BugReported',
  entity: { kind: 'bug', slug: 'the-bug', project_id: 'mcp-servers' },
  payload: {},
  rationale: null,
  caused_by_event_id: null,
  related_entities: [],
  span_id: '00000000-0000-4000-8000-000000000000',
  schema_version: 1,
  ...overrides,
})

const evtDetail = (overrides: Partial<AuditEventDetail> = {}): AuditEventDetail => ({
  ...evt(),
  related_queries: null,
  ...overrides,
})

beforeEach(() => {
  mockList.mockReset()
  mockGet.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

function renderWith(initialPath = '/audit') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuditLedgerPage />
    </MemoryRouter>,
  )
}

describe('AuditLedgerPage — initial render', () => {
  it('renders the title and filter bar', async () => {
    mockList.mockResolvedValueOnce({ items: [], next_cursor: null, page_size: 50 })
    renderWith()
    expect(screen.getByTestId('audit-ledger-page')).toBeInTheDocument()
    expect(screen.getByTestId('audit-ledger-filters')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByTestId('audit-ledger-empty')).toBeInTheDocument(),
    )
  })

  it('renders the no-events-yet empty state when no filter and no rows', async () => {
    mockList.mockResolvedValueOnce({ items: [], next_cursor: null, page_size: 50 })
    renderWith()
    await waitFor(() =>
      expect(screen.getByTestId('audit-ledger-empty').textContent).toMatch(
        /substrate ledger is empty/i,
      ),
    )
  })

  it('renders the filter-active empty state when filters return zero rows', async () => {
    mockList.mockResolvedValueOnce({ items: [], next_cursor: null, page_size: 50 })
    renderWith('/audit?k=bug')
    await waitFor(() =>
      expect(screen.getByTestId('audit-ledger-empty').textContent).toMatch(
        /no events match the current filter/i,
      ),
    )
  })

  it('renders a row per event when results are non-empty', async () => {
    mockList.mockResolvedValueOnce({
      items: [
        evt({ event_id: '0190f8a3-7b21-7c64-9d83-000000000001' }),
        evt({
          event_id: '0190f8a3-7b21-7c64-9d83-000000000002',
          type: 'BugResolved',
          rationale: 'Fixed in commit abc1234.',
        }),
      ],
      next_cursor: null,
      page_size: 50,
    })
    renderWith()
    await waitFor(() =>
      expect(screen.getByTestId('audit-ledger-table')).toBeInTheDocument(),
    )
    const rows = screen.getAllByRole('row')
    // 1 header row + 2 data rows
    expect(rows.length).toBe(3)
  })

  it('surfaces an error and role=alert on fetch failure', async () => {
    mockList.mockRejectedValueOnce(new Error('boom'))
    renderWith()
    await waitFor(() =>
      expect(screen.getByTestId('audit-ledger-error').textContent).toMatch(
        /failed to load events/i,
      ),
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})

describe('AuditLedgerPage — URL filter encoding', () => {
  it('translates URL params into the API filter object', async () => {
    mockList.mockResolvedValueOnce({ items: [], next_cursor: null, page_size: 50 })
    renderWith('/audit?k=bug&t=BugResolved&p=mcp-servers&q=regression&from=2026-05-01T00:00:00.000Z')
    await waitFor(() => {
      expect(mockList).toHaveBeenCalledWith(
        expect.objectContaining({
          entity_kind: 'bug',
          type: 'BugResolved',
          project: 'mcp-servers',
          q: 'regression',
          since: '2026-05-01T00:00:00.000Z',
          limit: 50,
        }),
        expect.anything(),
      )
    })
  })

  it('updates the URL when the user changes a filter field', async () => {
    mockList.mockResolvedValue({ items: [], next_cursor: null, page_size: 50 })
    renderWith()
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(1))

    const typeInput = screen.getByTestId('audit-ledger-filter-type') as HTMLInputElement
    await act(async () => {
      fireEvent.change(typeInput, { target: { value: 'BugResolved' } })
    })

    await waitFor(() => {
      expect(mockList).toHaveBeenLastCalledWith(
        expect.objectContaining({ type: 'BugResolved' }),
        expect.anything(),
      )
    })
  })

  it('does not crash when a filter is set with no matching events', async () => {
    mockList.mockResolvedValueOnce({ items: [], next_cursor: null, page_size: 50 })
    renderWith('/audit?ak=agent')
    await waitFor(() =>
      expect(screen.getByTestId('audit-ledger-empty')).toBeInTheDocument(),
    )
  })
})

describe('AuditLedgerPage — pagination', () => {
  it('renders the load-more button when next_cursor is present and fetches the next page on click', async () => {
    mockList
      .mockResolvedValueOnce({
        items: [evt({ event_id: '0190f8a3-7b21-7c64-9d83-000000000001' })],
        next_cursor: '0190f8a3-7b21-7c64-9d83-000000000001',
        page_size: 50,
      })
      .mockResolvedValueOnce({
        items: [evt({ event_id: '0190f8a3-7b21-7c64-9d83-000000000002' })],
        next_cursor: null,
        page_size: 50,
      })
    renderWith()
    const loadMore = await screen.findByTestId('audit-ledger-load-more')
    await act(async () => {
      loadMore.click()
    })
    await waitFor(() => {
      const rows = screen.getAllByRole('row')
      expect(rows.length).toBe(3) // header + 2 events
    })
    expect(mockList).toHaveBeenCalledTimes(2)
    expect(mockList).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: '0190f8a3-7b21-7c64-9d83-000000000001' }),
    )
  })

  it('hides the load-more button when next_cursor is null', async () => {
    mockList.mockResolvedValueOnce({
      items: [evt()],
      next_cursor: null,
      page_size: 50,
    })
    renderWith()
    await waitFor(() =>
      expect(screen.getByTestId('audit-ledger-table')).toBeInTheDocument(),
    )
    expect(screen.queryByTestId('audit-ledger-load-more')).toBeNull()
  })
})

describe('AuditLedgerPage — event detail drawer', () => {
  it('opens the drawer when a result row is clicked', async () => {
    const event = evt({ event_id: '0190f8a3-7b21-7c64-9d83-000000000001' })
    mockList.mockResolvedValueOnce({ items: [event], next_cursor: null, page_size: 50 })
    mockGet.mockResolvedValueOnce(evtDetail({ event_id: event.event_id }))

    renderWith()
    const row = await screen.findByTestId(`audit-ledger-row-${event.event_id}`)
    await act(async () => {
      fireEvent.click(row)
    })
    await waitFor(() =>
      expect(screen.getByTestId('event-detail-drawer')).toBeInTheDocument(),
    )
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith(event.event_id, expect.anything()))
  })

  it('closes the drawer when the close button is clicked', async () => {
    const event = evt({ event_id: '0190f8a3-7b21-7c64-9d83-000000000001' })
    mockList.mockResolvedValueOnce({ items: [event], next_cursor: null, page_size: 50 })
    mockGet.mockResolvedValueOnce(evtDetail({ event_id: event.event_id }))

    renderWith(`/audit?event=${event.event_id}`)
    const closeBtn = await screen.findByTestId('event-detail-drawer-close')
    await act(async () => {
      fireEvent.click(closeBtn)
    })
    await waitFor(() =>
      expect(screen.queryByTestId('event-detail-drawer')).toBeNull(),
    )
  })

  it('closes the drawer on Escape keypress', async () => {
    const event = evt({ event_id: '0190f8a3-7b21-7c64-9d83-000000000001' })
    mockList.mockResolvedValue({ items: [event], next_cursor: null, page_size: 50 })
    mockGet.mockResolvedValueOnce(evtDetail({ event_id: event.event_id }))

    renderWith(`/audit?event=${event.event_id}`)
    await screen.findByTestId('event-detail-drawer')
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' })
    })
    await waitFor(() =>
      expect(screen.queryByTestId('event-detail-drawer')).toBeNull(),
    )
  })

  it('renders the rationale verbatim in the drawer', async () => {
    const event = evt({ event_id: 'evt-1' })
    mockList.mockResolvedValue({ items: [event], next_cursor: null, page_size: 50 })
    mockGet.mockResolvedValueOnce(
      evtDetail({
        event_id: 'evt-1',
        rationale: 'Root cause was the bug-schema title field defaulting to empty.',
      }),
    )

    renderWith('/audit?event=evt-1')
    await waitFor(() =>
      expect(screen.getByTestId('event-detail-drawer-rationale')).toHaveTextContent(
        /Root cause was the bug-schema title/,
      ),
    )
  })

  it('renders the "telemetry not available" copy when related_queries is null', async () => {
    mockList.mockResolvedValue({ items: [evt({ event_id: 'evt-2' })], next_cursor: null, page_size: 50 })
    mockGet.mockResolvedValueOnce(evtDetail({ event_id: 'evt-2', related_queries: null }))

    renderWith('/audit?event=evt-2')
    await waitFor(() =>
      expect(
        screen.getByTestId('event-detail-drawer-related-queries-absent'),
      ).toHaveTextContent(/telemetry data not available/i),
    )
  })

  it('renders "no related queries" copy when related_queries is an empty array', async () => {
    mockList.mockResolvedValue({ items: [evt({ event_id: 'evt-3' })], next_cursor: null, page_size: 50 })
    mockGet.mockResolvedValueOnce(evtDetail({ event_id: 'evt-3', related_queries: [] }))

    renderWith('/audit?event=evt-3')
    await waitFor(() =>
      expect(
        screen.getByTestId('event-detail-drawer-related-queries-empty'),
      ).toHaveTextContent(/no related queries/i),
    )
  })

  // Bug 1386: the table renders the live Go wire shape — entity_kind,
  // entity_slug, outcome_kind, resolution_id, prompt_id. The earlier TS
  // sketch (interaction_id / query / source_type) silently produced empty
  // cells; this test pins the corrected shape so a regression to the
  // sketch fails loudly.
  it('renders the related-queries table when entries are present', async () => {
    mockList.mockResolvedValue({ items: [evt({ event_id: 'evt-4' })], next_cursor: null, page_size: 50 })
    mockGet.mockResolvedValueOnce(
      evtDetail({
        event_id: 'evt-4',
        related_queries: [
          {
            resolution_id: 'reso-1',
            entity_kind: 'bug',
            entity_slug: 'flaky-test',
            outcome_kind: 'fixed',
            prompt_id: 'prompt-1',
          },
          {
            resolution_id: 'reso-2',
            entity_kind: 'task',
            entity_slug: 'reshape-projection',
            outcome_kind: 'completed',
            prompt_id: 'prompt-2',
          },
        ],
      }),
    )

    renderWith('/audit?event=evt-4')
    await waitFor(() =>
      expect(screen.getByTestId('event-detail-drawer-related-queries')).toBeInTheDocument(),
    )
    expect(screen.getByText(/flaky-test/)).toBeInTheDocument()
    expect(screen.getByText(/reshape-projection/)).toBeInTheDocument()
    expect(screen.getByText('fixed')).toBeInTheDocument()
    expect(screen.getByText('completed')).toBeInTheDocument()
  })

  it('renders an error in the drawer when getAuditEvent fails', async () => {
    mockList.mockResolvedValue({ items: [evt({ event_id: 'evt-5' })], next_cursor: null, page_size: 50 })
    mockGet.mockRejectedValueOnce(new Error('not found'))

    renderWith('/audit?event=evt-5')
    await waitFor(() =>
      expect(screen.getByTestId('event-detail-drawer-error')).toHaveTextContent('not found'),
    )
  })
})

describe('AuditLedgerPage — clear-all filters', () => {
  it('shows the clear-all button only when at least one filter is active', async () => {
    mockList.mockResolvedValue({ items: [], next_cursor: null, page_size: 50 })

    const { unmount } = renderWith('/audit')
    await waitFor(() => expect(mockList).toHaveBeenCalled())
    expect(screen.queryByTestId('audit-ledger-clear-filters')).toBeNull()
    unmount()

    renderWith('/audit?k=bug')
    expect(
      await screen.findByTestId('audit-ledger-clear-filters'),
    ).toBeInTheDocument()
  })

  it('clearing filters resets the URL and re-fetches with no filter', async () => {
    mockList.mockResolvedValue({ items: [], next_cursor: null, page_size: 50 })
    renderWith('/audit?k=bug&t=BugResolved')
    const clearBtn = await screen.findByTestId('audit-ledger-clear-filters')
    await act(async () => {
      fireEvent.click(clearBtn)
    })
    await waitFor(() => {
      expect(mockList).toHaveBeenLastCalledWith(
        { limit: 50 },
        expect.anything(),
      )
    })
  })
})

describe('AuditLedgerPage — default last-24h time bound', () => {
  // F1 §9.2 design: naked load seeds the since filter to now() - 24h so the
  // first paint reflects today's activity. The default applies in-memory
  // only — URL stays clean — so a deep-link with explicit from= overrides
  // and Clear-all escapes cleanly.

  it('applies a since=~24h-ago filter to the initial fetch on a naked load', async () => {
    mockList.mockResolvedValue({ items: [], next_cursor: null, page_size: 50 })
    const before = Date.now() - 24 * 60 * 60 * 1000
    renderWith('/audit')
    await waitFor(() => expect(mockList).toHaveBeenCalled())
    const after = Date.now() - 24 * 60 * 60 * 1000
    const firstCall = mockList.mock.calls[0]
    if (firstCall === undefined) throw new Error('listAuditEvents not called')
    const callFilters = firstCall[0]
    if (callFilters === undefined) throw new Error('first arg to listAuditEvents missing')
    expect(typeof callFilters.since).toBe('string')
    const sinceMs = Date.parse(callFilters.since as string)
    // Allow a generous window — the seed runs at mount and the assertion
    // happens after the test framework has done some bookkeeping.
    expect(sinceMs).toBeGreaterThanOrEqual(before - 5000)
    expect(sinceMs).toBeLessThanOrEqual(after + 5000)
  })

  it('surfaces the active 24h window in the status strip on a naked load', async () => {
    mockList.mockResolvedValue({ items: [], next_cursor: null, page_size: 50 })
    renderWith('/audit')
    const badge = await screen.findByTestId('audit-ledger-since-badge')
    expect(badge.textContent).toMatch(/last 24 hours/i)
    expect(badge.textContent).toMatch(/from=/)
  })

  it('honors an explicit from= URL param over the default', async () => {
    mockList.mockResolvedValue({ items: [], next_cursor: null, page_size: 50 })
    renderWith('/audit?from=2026-05-15T00%3A00%3A00.000Z')
    await waitFor(() => expect(mockList).toHaveBeenCalled())
    const firstCall = mockList.mock.calls[0]
    if (firstCall === undefined) throw new Error('listAuditEvents not called')
    const callFilters = firstCall[0]
    if (callFilters === undefined) throw new Error('first arg to listAuditEvents missing')
    expect(callFilters.since).toBe('2026-05-15T00:00:00.000Z')
    // Status strip surfaces the explicit value with the original 'Since X' shape,
    // not the 'last 24 hours' default copy.
    const badge = await screen.findByTestId('audit-ledger-since-badge')
    expect(badge.textContent).toMatch(/Since 2026-05-15T00:00:00\.000Z/)
    expect(badge.textContent).not.toMatch(/last 24 hours/i)
  })

  it('Clear all filters drops the default time bound, not just the URL params', async () => {
    mockList.mockResolvedValue({ items: [], next_cursor: null, page_size: 50 })
    renderWith('/audit?k=bug')
    const clearBtn = await screen.findByTestId('audit-ledger-clear-filters')
    await act(async () => {
      fireEvent.click(clearBtn)
    })
    await waitFor(() => {
      expect(mockList).toHaveBeenLastCalledWith(
        { limit: 50 },
        expect.anything(),
      )
    })
    // Status badge is gone — neither the default nor an explicit value
    // is in effect after the clear.
    expect(screen.queryByTestId('audit-ledger-since-badge')).toBeNull()
  })
})

describe('entityTimelinePath — drawer deep-link URL shapes', () => {
  it('bug entity → /bugs?slug=<slug>', () => {
    const url = entityTimelinePath(
      { kind: 'bug', slug: 'the-bug', project_id: 'mcp-servers' },
      [],
    )
    expect(url).toBe('/bugs?slug=the-bug')
  })

  it('chain entity → /tasks/chains?chain=<slug>', () => {
    const url = entityTimelinePath(
      { kind: 'chain', slug: 'janitorial-pass-2026-05', project_id: 'mcp-servers' },
      [],
    )
    expect(url).toBe('/tasks/chains?chain=janitorial-pass-2026-05')
  })

  it('task entity with chain parent → /tasks/chains?chain=<parent>&task=<slug>', () => {
    const url = entityTimelinePath(
      { kind: 'task', slug: 'audit-ledger-default-last-24h', project_id: 'mcp-servers' },
      [
        { kind: 'chain', slug: 'janitorial-pass-2026-05', project_id: 'mcp-servers' },
      ],
    )
    expect(url).toBe(
      '/tasks/chains?chain=janitorial-pass-2026-05&task=audit-ledger-default-last-24h',
    )
  })

  it('task entity without chain parent → /tasks/chains?task=<slug>', () => {
    const url = entityTimelinePath(
      { kind: 'task', slug: 'orphan-task', project_id: null },
      [],
    )
    expect(url).toBe('/tasks/chains?task=orphan-task')
  })

  it('benchmark_run entity → null (no dedicated route)', () => {
    expect(
      entityTimelinePath(
        { kind: 'benchmark_run', slug: 'run-1', project_id: 'mcp-servers' },
        [],
      ),
    ).toBeNull()
  })

  it('encodes slugs with special characters', () => {
    const url = entityTimelinePath(
      { kind: 'bug', slug: 'has spaces & ampersands', project_id: null },
      [],
    )
    expect(url).toBe('/bugs?slug=has%20spaces%20%26%20ampersands')
  })
})

describe('AuditLedgerPage — entity deep links', () => {
  // F1 §7.6: every event row's entity column is a deep link to the
  // entity's timeline; click stopPropagation keeps the surrounding
  // row's drawer-open onClick dormant.

  it('renders the entity column as an anchor for bug/chain/task kinds', async () => {
    mockList.mockResolvedValue({
      items: [
        evt({
          event_id: 'evt-bug-1',
          entity: { kind: 'bug', slug: 'the-bug', project_id: 'mcp-servers' },
        }),
        evt({
          event_id: 'evt-chain-1',
          entity: { kind: 'chain', slug: 'the-chain', project_id: 'mcp-servers' },
        }),
        evt({
          event_id: 'evt-task-1',
          entity: { kind: 'task', slug: 'the-task', project_id: 'mcp-servers' },
        }),
      ],
      next_cursor: null,
      page_size: 50,
    })
    renderWith()
    const bugLink = await screen.findByTestId('audit-ledger-entity-evt-bug-1-link')
    const chainLink = await screen.findByTestId('audit-ledger-entity-evt-chain-1-link')
    const taskLink = await screen.findByTestId('audit-ledger-entity-evt-task-1-link')
    expect(bugLink.getAttribute('href')).toBe('/bugs?slug=the-bug')
    expect(chainLink.getAttribute('href')).toBe('/tasks/chains?chain=the-chain')
    expect(taskLink.getAttribute('href')).toBe('/tasks/chains?task=the-task')
  })

  it('renders the entity column as plain text for entity kinds with no route', async () => {
    mockList.mockResolvedValue({
      items: [
        evt({
          event_id: 'evt-bench-1',
          entity: { kind: 'benchmark_run', slug: 'run-1', project_id: 'mcp-servers' },
        }),
      ],
      next_cursor: null,
      page_size: 50,
    })
    renderWith()
    await screen.findByTestId('audit-ledger-entity-evt-bench-1-plain')
    // And there should NOT be a link sibling.
    expect(
      screen.queryByTestId('audit-ledger-entity-evt-bench-1-link'),
    ).toBeNull()
  })

  it('clicking the entity link does not open the drawer', async () => {
    mockList.mockResolvedValue({
      items: [
        evt({
          event_id: 'evt-stop-1',
          entity: { kind: 'bug', slug: 'still-stops', project_id: 'mcp-servers' },
        }),
      ],
      next_cursor: null,
      page_size: 50,
    })
    renderWith()
    const link = await screen.findByTestId('audit-ledger-entity-evt-stop-1-link')
    // Suppress the default anchor navigation so jsdom doesn't actually
    // try to traverse — we only care that the row's onClick doesn't fire.
    await act(async () => {
      fireEvent.click(link, { defaultPrevented: false })
    })
    // Drawer would be triggered by row click; assert it's NOT mounted.
    expect(screen.queryByTestId('event-detail-drawer')).toBeNull()
  })
})

describe('EventDetailDrawer — deep links section', () => {
  it('renders a View entity timeline link for a bug entity', async () => {
    mockList.mockResolvedValue({
      items: [evt({ event_id: 'evt-d-bug', entity: { kind: 'bug', slug: 'drawer-bug', project_id: 'mcp-servers' } })],
      next_cursor: null,
      page_size: 50,
    })
    mockGet.mockResolvedValueOnce(
      evtDetail({
        event_id: 'evt-d-bug',
        entity: { kind: 'bug', slug: 'drawer-bug', project_id: 'mcp-servers' },
      }),
    )
    renderWith('/audit?event=evt-d-bug')
    const link = await screen.findByTestId('event-detail-drawer-entity-timeline-link')
    expect(link.getAttribute('href')).toBe('/bugs?slug=drawer-bug')
    expect(link.textContent).toMatch(/View entity timeline/)
  })

  it('renders the timeline link with chain+task parent resolution', async () => {
    mockList.mockResolvedValue({
      items: [evt({ event_id: 'evt-d-task' })],
      next_cursor: null,
      page_size: 50,
    })
    mockGet.mockResolvedValueOnce(
      evtDetail({
        event_id: 'evt-d-task',
        entity: { kind: 'task', slug: 'drawer-task', project_id: 'mcp-servers' },
        related_entities: [
          { kind: 'chain', slug: 'parent-chain', project_id: 'mcp-servers' },
        ],
      }),
    )
    renderWith('/audit?event=evt-d-task')
    const link = await screen.findByTestId('event-detail-drawer-entity-timeline-link')
    expect(link.getAttribute('href')).toBe(
      '/tasks/chains?chain=parent-chain&task=drawer-task',
    )
  })

  it('renders the empty-state copy for entity kinds with no dedicated route', async () => {
    mockList.mockResolvedValue({
      items: [evt({ event_id: 'evt-d-bench' })],
      next_cursor: null,
      page_size: 50,
    })
    mockGet.mockResolvedValueOnce(
      evtDetail({
        event_id: 'evt-d-bench',
        entity: { kind: 'benchmark_run', slug: 'run-1', project_id: 'mcp-servers' },
      }),
    )
    renderWith('/audit?event=evt-d-bench')
    const empty = await screen.findByTestId('event-detail-drawer-deep-links-empty')
    expect(empty.textContent).toMatch(/benchmark_run/)
    expect(screen.queryByTestId('event-detail-drawer-entity-timeline-link')).toBeNull()
  })
})
