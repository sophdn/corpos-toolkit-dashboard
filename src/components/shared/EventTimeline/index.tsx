import { useEffect, useMemo, useRef, useState } from 'react'
import { listEntityAuditEvents } from '../../../api/auditEvents'
import { useEventBus } from '../../../hooks/useEventBus'
import type {
  AuditEntityKind,
  AuditEvent,
} from '../../../lib/auditEvents'
import type { ToolkitEvent, ToolkitEventKind } from '../../../lib/events'
import { renderEventPayload } from './per-type-renderers'
import {
  ReferencesResolvedSuffix,
  eventTypeAdmitsReferencesResolvedSuffix,
} from './ReferencesResolvedSuffix'
import styles from './EventTimeline.module.css'

/**
 * EventTimeline renders the substrate audit history for one entity:
 * the chronological list of events emitted while the entity's state
 * changed. Slotted into BugDetailPanel, ChainIndex chain-detail, and
 * (where applicable) per-task views.
 *
 * The component is read-only — events are append-only at the substrate
 * level (see docs/EVENT_SUBSTRATE.md §3.4); the UI cannot mutate.
 *
 * SSE-aware: when a relevant ToolkitEvent arrives for this entity, the
 * timeline re-fetches the latest page. Matching is conservative
 * (entity slug + kind), so an unrelated bug change doesn't refresh the
 * current entity's view.
 *
 * See docs/SUBSTRATE_FRONTEND.md §8.1 for the contract.
 */

const DEFAULT_PAGE_SIZE = 50

const SSE_KINDS_BY_ENTITY: Record<AuditEntityKind, ToolkitEventKind[]> = {
  bug: ['bug_filed', 'bug_resolved'],
  suggestion: ['suggestion_filed', 'suggestion_resolved'],
  task: ['task_completed', 'task_transitioned'],
  // Chains don't have a direct SSE event today; task_* changes inside
  // the chain will trigger a refresh because the chain's timeline
  // surfaces task events of children when the timeline is joined to
  // related entities. For now the chain timeline refreshes on the
  // task signals since they are the most common chain-internal
  // mutations.
  chain: ['task_completed', 'task_transitioned'],
  benchmark_run: ['benchmark_recorded'],
}

export interface EventTimelineProps {
  kind: AuditEntityKind
  slug: string
  project?: string
}

export function EventTimeline({ kind, slug, project }: EventTimelineProps) {
  const [items, setItems] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)
  const abortRef = useRef<AbortController | null>(null)

  // Subscribe to SSE event kinds that affect this entity. Module-level
  // const array satisfies the useEventBus stability contract.
  const sseKinds = useMemo<ToolkitEventKind[]>(
    () => SSE_KINDS_BY_ENTITY[kind] ?? [],
    [kind],
  )
  useEventBus(sseKinds, (ev: ToolkitEvent) => {
    if (eventTouchesEntity(ev, kind, slug)) {
      setRefreshTick((t) => t + 1)
    }
  })

  useEffect(() => {
    if (abortRef.current !== null) abortRef.current.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setLoading(true)
    setError(null)

    listEntityAuditEvents(
      kind,
      slug,
      { project, limit: DEFAULT_PAGE_SIZE },
      ctrl.signal,
    )
      .then((resp) => {
        setItems(resp.items)
        setNextCursor(resp.next_cursor)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return
        const msg = err instanceof Error ? err.message : 'unknown error'
        setError(msg)
        setLoading(false)
      })

    return () => ctrl.abort()
  }, [kind, slug, project, refreshTick])

  function loadMore() {
    if (nextCursor === null) return
    listEntityAuditEvents(
      kind,
      slug,
      { project, limit: DEFAULT_PAGE_SIZE, cursor: nextCursor },
    )
      .then((resp) => {
        setItems((prev) => [...prev, ...resp.items])
        setNextCursor(resp.next_cursor)
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'unknown error'
        setError(msg)
      })
  }

  if (loading && items.length === 0) {
    return (
      <p data-testid="event-timeline-loading" className={styles.placeholder}>
        Loading event history…
      </p>
    )
  }

  if (error !== null) {
    return (
      <p data-testid="event-timeline-error" className={styles.error} role="alert">
        Failed to load event history: {error}
      </p>
    )
  }

  if (items.length === 0) {
    return (
      <p data-testid="event-timeline-empty" className={styles.empty}>
        No events recorded for this {kind} yet.
      </p>
    )
  }

  return (
    <div data-testid="event-timeline">
      <ol className={styles.timeline} role="list">
        {items.map((evt) => (
          <TimelineEntry key={evt.event_id} event={evt} />
        ))}
      </ol>
      {nextCursor !== null && (
        <button
          type="button"
          className={styles.showMore}
          onClick={loadMore}
          data-testid="event-timeline-load-more"
        >
          Load more
        </button>
      )}
    </div>
  )
}

function TimelineEntry({ event }: { event: AuditEvent }) {
  const context = useMemo(
    () => ({
      refs: {
        caused_by_event_id: event.caused_by_event_id,
        related_entities: event.related_entities,
      },
    }),
    [event],
  )

  return (
    <li
      className={styles.entry}
      role="listitem"
      aria-label={`${event.type} by ${event.actor.kind}:${event.actor.id} at ${event.ts}`}
      data-testid={`event-timeline-entry-${event.event_id}`}
    >
      {/*
        Single-column descending layout per Phase 4 F3 follow-up: type
        chip first as the header, then the metadata strip (time, actor,
        span link), then the payload, then the rationale. Replaces the
        prior 2-column grid (140px meta column + 1fr body column) which
        squished long payload values into the right column.
      */}
      <span className={styles.typeChip} data-testid="event-type-chip">
        {event.type}
      </span>
      <div className={styles.metaStrip}>
        <time dateTime={event.ts}>{formatTs(event.ts)}</time>
        <span className={styles.metaSeparator} aria-hidden="true">·</span>
        <span className={styles.actorRow}>
          <span className={styles.actorKind}>{event.actor.kind}</span>
          <span className={styles.actorID}>{event.actor.id}</span>
        </span>
        <span className={styles.metaSeparator} aria-hidden="true">·</span>
        <SpanLink spanId={event.span_id} />
      </div>
      {renderEventPayload(event.type, event.payload, context)}
      {event.rationale !== null && event.rationale !== '' && (
        <p
          className={styles.rationale}
          data-testid="event-rationale"
        >
          {event.rationale}
        </p>
      )}
      {eventTypeAdmitsReferencesResolvedSuffix(event.type) && (
        <ReferencesResolvedSuffix entity={event.entity} />
      )}
    </li>
  )
}

/**
 * SpanLink targets /spans?span_id=<id>; the SpansPanel filters its live
 * buffer to the matching span when present and falls back to a
 * "not in buffer" empty state otherwise. The click also writes the
 * span_id to the clipboard (best-effort) so the operator can SQL-search
 * even when the live buffer doesn't carry the span.
 *
 * See docs/SUBSTRATE_FRONTEND.md §5.2.
 */
function SpanLink({ spanId }: { spanId: string }) {
  function handleClick() {
    if (typeof navigator !== 'undefined' && navigator.clipboard !== undefined) {
      // Fire-and-forget; permission denial is acceptable.
      void navigator.clipboard.writeText(spanId).catch(() => {})
    }
  }
  return (
    <a
      className={styles.spanLink}
      href={`/spans?span_id=${encodeURIComponent(spanId)}`}
      onClick={handleClick}
      data-testid="event-span-link"
      data-span-id={spanId}
    >
      span {shortenSpan(spanId)}
    </a>
  )
}

function shortenSpan(id: string): string {
  if (id.length <= 12) return id
  return id.slice(0, 8) + '…'
}

function formatTs(iso: string): string {
  // Stable display: trim subsecond precision but keep TZ. The full
  // ISO string is in the <time dateTime=...> attribute for screen
  // readers / sorting.
  const m = iso.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/)
  return m !== null ? m[1].replace('T', ' ') : iso
}

/**
 * Conservative match: an SSE event "touches" the timeline entity when
 * the kind matches and the slug payload field matches. Cross-entity
 * cascades (a bug routed to a task affecting both) are out of scope —
 * the timeline refreshes on the *primary* entity's signals, and
 * cascade-emitted events arrive on the primary entity's timeline via
 * caused_by_event_id chaining (no extra SSE needed).
 */
function eventTouchesEntity(
  ev: ToolkitEvent,
  kind: AuditEntityKind,
  slug: string,
): boolean {
  switch (ev.event) {
    case 'bug_filed':
    case 'bug_resolved':
      return kind === 'bug' && ev.slug === slug
    case 'suggestion_filed':
    case 'suggestion_resolved':
      return kind === 'suggestion' && ev.slug === slug
    case 'task_completed':
      return kind === 'task' && ev.task_slug === slug
    case 'task_transitioned':
      return kind === 'task' && ev.task_slug === slug
    case 'benchmark_recorded':
      // Benchmark SSE events carry tool_name + model_name, not a
      // benchmark_run slug. Fall back to "refresh on any benchmark
      // signal" — acceptable because benchmark runs are infrequent.
      return kind === 'benchmark_run'
    default:
      return false
  }
}
