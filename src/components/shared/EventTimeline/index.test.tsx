import { render, screen, waitFor, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listEntityAuditEvents } from '../../../api/auditEvents'
import type { AuditEvent } from '../../../lib/auditEvents'
import { EventTimeline } from '.'
import { renderEventPayload, registeredEventTypes } from './per-type-renderers'

vi.mock('../../../api/auditEvents', () => ({
  listEntityAuditEvents: vi.fn(),
}))
vi.mock('../../../hooks/useEventBus', () => ({
  // Stub: do nothing. SSE refresh is tested separately.
  useEventBus: vi.fn(),
}))

const mockList = vi.mocked(listEntityAuditEvents)

const baseEvent = (overrides: Partial<AuditEvent> = {}): AuditEvent => ({
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

beforeEach(() => {
  mockList.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('EventTimeline — loading / error / empty states', () => {
  it('renders the loading placeholder while the initial fetch is in flight', async () => {
    let resolve!: (v: { items: AuditEvent[]; next_cursor: string | null; page_size: number }) => void
    mockList.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r
      }),
    )
    render(<EventTimeline kind="bug" slug="the-bug" />)
    expect(screen.getByTestId('event-timeline-loading')).toBeInTheDocument()
    // unblock for hygiene
    await act(async () => {
      resolve({ items: [], next_cursor: null, page_size: 50 })
    })
  })

  it('renders an error message and role=alert when the fetch fails', async () => {
    mockList.mockRejectedValueOnce(new Error('boom'))
    render(<EventTimeline kind="bug" slug="the-bug" />)
    await waitFor(() =>
      expect(screen.getByTestId('event-timeline-error')).toHaveTextContent('boom'),
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('renders an entity-specific empty state when no events exist', async () => {
    mockList.mockResolvedValueOnce({ items: [], next_cursor: null, page_size: 50 })
    render(<EventTimeline kind="chain" slug="the-chain" />)
    await waitFor(() =>
      expect(screen.getByTestId('event-timeline-empty')).toHaveTextContent(
        /no events recorded for this chain/i,
      ),
    )
  })
})

describe('EventTimeline — entry rendering', () => {
  it('renders one entry per event with timestamp, actor, type, span link', async () => {
    mockList.mockResolvedValueOnce({
      items: [
        baseEvent({ event_id: '0190f8a3-7b21-7c64-9d83-1f44a2b18001' }),
        baseEvent({
          event_id: '0190f8a3-7b21-7c64-9d83-1f44a2b18002',
          type: 'BugResolved',
          payload: { kind: 'fixed', commit_sha: 'abc1234' },
        }),
      ],
      next_cursor: null,
      page_size: 50,
    })
    render(<EventTimeline kind="bug" slug="the-bug" project="mcp-servers" />)
    await waitFor(() =>
      expect(screen.getByTestId('event-timeline')).toBeInTheDocument(),
    )
    expect(
      screen.getAllByTestId('event-type-chip').map((el) => el.textContent),
    ).toEqual(['BugReported', 'BugResolved'])

    const spanLinks = screen.getAllByTestId('event-span-link')
    expect(spanLinks).toHaveLength(2)
    expect(spanLinks[0].getAttribute('href')).toContain('/spans?span_id=')
  })

  it('forwards the project filter to the API call', async () => {
    mockList.mockResolvedValueOnce({ items: [], next_cursor: null, page_size: 50 })
    render(<EventTimeline kind="bug" slug="the-bug" project="some-project" />)
    await waitFor(() =>
      expect(mockList).toHaveBeenCalledWith(
        'bug',
        'the-bug',
        { project: 'some-project', limit: 50 },
        expect.anything(),
      ),
    )
  })

  it('renders the rationale verbatim when present', async () => {
    mockList.mockResolvedValueOnce({
      items: [
        baseEvent({
          rationale: 'Root cause was the bug-schema title field defaulting to empty.',
        }),
      ],
      next_cursor: null,
      page_size: 50,
    })
    render(<EventTimeline kind="bug" slug="the-bug" />)
    await waitFor(() =>
      expect(screen.getByTestId('event-rationale')).toHaveTextContent(
        'Root cause was the bug-schema title field defaulting to empty.',
      ),
    )
  })

  it('does not render the rationale block when rationale is null', async () => {
    mockList.mockResolvedValueOnce({
      items: [baseEvent({ rationale: null })],
      next_cursor: null,
      page_size: 50,
    })
    render(<EventTimeline kind="bug" slug="the-bug" />)
    await waitFor(() =>
      expect(screen.getByTestId('event-timeline')).toBeInTheDocument(),
    )
    expect(screen.queryByTestId('event-rationale')).toBeNull()
  })

  it('exposes role=listitem with an aria-label per entry', async () => {
    mockList.mockResolvedValueOnce({
      items: [
        baseEvent({
          actor: { kind: 'agent', id: 'claude-opus-4-7' },
          type: 'BugResolved',
        }),
      ],
      next_cursor: null,
      page_size: 50,
    })
    render(<EventTimeline kind="bug" slug="the-bug" />)
    await waitFor(() =>
      expect(screen.getByRole('listitem')).toHaveAttribute(
        'aria-label',
        expect.stringMatching(/^BugResolved by agent:claude-opus-4-7 at /),
      ),
    )
  })
})

describe('EventTimeline — load more', () => {
  it('renders a "Load more" button when next_cursor is non-null', async () => {
    mockList.mockResolvedValueOnce({
      items: [baseEvent()],
      next_cursor: '0190f8a3-7b21-7c64-9d83-1f44a2b18099',
      page_size: 50,
    })
    render(<EventTimeline kind="bug" slug="the-bug" />)
    await waitFor(() =>
      expect(screen.getByTestId('event-timeline-load-more')).toBeInTheDocument(),
    )
  })

  it('does not render the "Load more" button when next_cursor is null', async () => {
    mockList.mockResolvedValueOnce({
      items: [baseEvent()],
      next_cursor: null,
      page_size: 50,
    })
    render(<EventTimeline kind="bug" slug="the-bug" />)
    await waitFor(() =>
      expect(screen.getByTestId('event-timeline')).toBeInTheDocument(),
    )
    expect(screen.queryByTestId('event-timeline-load-more')).toBeNull()
  })

  it('appends fetched items when "Load more" is clicked', async () => {
    mockList
      .mockResolvedValueOnce({
        items: [baseEvent({ event_id: '0190f8a3-7b21-7c64-9d83-1f44a2b18001' })],
        next_cursor: '0190f8a3-7b21-7c64-9d83-1f44a2b18001',
        page_size: 50,
      })
      .mockResolvedValueOnce({
        items: [baseEvent({ event_id: '0190f8a3-7b21-7c64-9d83-1f44a2b18002' })],
        next_cursor: null,
        page_size: 50,
      })

    render(<EventTimeline kind="bug" slug="the-bug" />)
    const loadMore = await screen.findByTestId('event-timeline-load-more')
    await act(async () => {
      loadMore.click()
    })
    await waitFor(() => {
      const entries = screen.getAllByRole('listitem')
      expect(entries.length).toBe(2)
    })
  })
})

describe('EventTimeline — per-type renderer dispatch', () => {
  it('renders the BugResolved payload via the typed renderer', async () => {
    mockList.mockResolvedValueOnce({
      items: [
        baseEvent({
          type: 'BugResolved',
          payload: { kind: 'fixed', commit_sha: 'abc1234567890def' },
        }),
      ],
      next_cursor: null,
      page_size: 50,
    })
    render(<EventTimeline kind="bug" slug="the-bug" />)
    await waitFor(() =>
      expect(screen.getByTestId('event-timeline')).toBeInTheDocument(),
    )
    // truncated commit chip is in the rendered payload
    const text = screen.getByTestId('event-timeline').textContent ?? ''
    expect(text).toContain('Resolution')
    expect(text).toContain('fixed')
  })

  it('falls back to JSON pretty-print for unknown types', async () => {
    mockList.mockResolvedValueOnce({
      items: [
        baseEvent({
          type: 'TotallyMadeUpFutureType',
          payload: { weird_field: 42 },
        }),
      ],
      next_cursor: null,
      page_size: 50,
    })
    render(<EventTimeline kind="bug" slug="the-bug" />)
    await waitFor(() =>
      expect(screen.getByTestId('event-timeline')).toBeInTheDocument(),
    )
    const text = screen.getByTestId('event-timeline').textContent ?? ''
    expect(text).toContain('weird_field')
    expect(text).toContain('42')
  })
})

describe('EventTimeline — span link', () => {
  it('targets /spans?span_id=<id> for SpansPanel filtering', async () => {
    mockList.mockResolvedValueOnce({
      items: [baseEvent({ span_id: 'abc-span-id' })],
      next_cursor: null,
      page_size: 50,
    })
    render(<EventTimeline kind="bug" slug="the-bug" />)
    const link = await screen.findByTestId('event-span-link')
    expect(link.getAttribute('href')).toBe('/spans?span_id=abc-span-id')
    expect(link.getAttribute('data-span-id')).toBe('abc-span-id')
  })

  it('writes the span_id to the clipboard on click', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    mockList.mockResolvedValueOnce({
      items: [baseEvent({ span_id: 'abc-span-id' })],
      next_cursor: null,
      page_size: 50,
    })
    render(<EventTimeline kind="bug" slug="the-bug" />)
    const link = await screen.findByTestId('event-span-link')
    await act(async () => {
      link.click()
    })
    expect(writeText).toHaveBeenCalledWith('abc-span-id')
  })

  it('does not throw when clipboard write rejects', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    })
    mockList.mockResolvedValueOnce({
      items: [baseEvent({ span_id: 'abc' })],
      next_cursor: null,
      page_size: 50,
    })
    render(<EventTimeline kind="bug" slug="the-bug" />)
    const link = await screen.findByTestId('event-span-link')
    // The defensive clipboard call swallows rejection; no unhandled
    // rejection should surface to the test runner.
    await act(async () => {
      link.click()
    })
    expect(link).toBeInTheDocument()
  })
})

describe('per-type renderers — pure-function contract', () => {
  // The renderer contract requires pure functions of payload + context.
  // We check the registered set against the EVENT_CATALOG's
  // high-frequency types: regression test against the chain F3
  // acceptance criterion.
  it('registers renderers for every catalog lifecycle type', () => {
    const types = registeredEventTypes()
    const required = [
      'BugReported',
      'BugTriaged',
      'BugResolved',
      'BugReopened',
      'BugEdited',
      'BugStamped',
      'TaskCreated',
      'TaskCompleted',
      'TaskCancelled',
      'TaskTransitioned',
      'TaskEdited',
      'TaskStamped',
      'ChainCreated',
      'ChainClosed',
      'ChainEdited',
    ]
    for (const t of required) {
      expect(types).toContain(t)
    }
  })

  it('renders an unknown type via the generic fallback without throwing', () => {
    const node = renderEventPayload('NeverHeardOf', { x: 1 }, {
      refs: { caused_by_event_id: null, related_entities: [] },
    })
    expect(node).not.toBeNull()
  })

  it('renders bug renderers idempotently for the same input', () => {
    const ctx = { refs: { caused_by_event_id: null, related_entities: [] } }
    const a = renderEventPayload('BugResolved', { kind: 'fixed', commit_sha: 'abc' }, ctx)
    const b = renderEventPayload('BugResolved', { kind: 'fixed', commit_sha: 'abc' }, ctx)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})
