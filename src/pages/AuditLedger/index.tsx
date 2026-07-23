import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getAuditEvent, listAuditEvents } from '../../api/auditEvents'
import type {
  AuditEntity,
  AuditEntityRef,
  AuditEvent,
  AuditEventDetail,
  AuditEventListFilters,
  RelatedQuery,
} from '../../lib/auditEvents'
import { useEventBus } from '../../hooks/useEventBus'
import { ALL_EVENT_KINDS } from '../../lib/events'
import { renderEventPayload } from '../../components/shared/EventTimeline/per-type-renderers'
import styles from './AuditLedger.module.css'

/**
 * AuditLedger — top-level operator view of the substrate event log.
 *
 * URL-encoded filter state (compact param names per
 * docs/SUBSTRATE_FRONTEND.md §9.1). Cursor-paginated. SSE-aware "show
 * new events" affordance that refreshes from the latest page when new
 * events land.
 *
 * Each row click opens an <EventDetailDrawer> that surfaces the full
 * payload, rationale, refs, and cross-substrate join (related_queries).
 */

const DEFAULT_PAGE_SIZE = 50

const ENTITY_KIND_OPTIONS = ['', 'bug', 'task', 'chain', 'benchmark_run', 'benchmark_metric'] as const
const ACTOR_KIND_OPTIONS = ['', 'agent', 'human', 'system'] as const

export function AuditLedgerPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const urlFilters = useMemo(() => paramsToFilters(searchParams), [searchParams])
  const drawerEventId = searchParams.get('event')

  // F1 §9.2: when no `from` URL param is present, default the time-bound
  // window to the last 24 hours so operators see today's activity instead
  // of a confusing 'nothing happened today' empty state. The default is
  // applied in-memory only — the URL stays clean — so `Clear all filters`
  // can escape it (setting useDefaultSince=false) and a deep-link with
  // explicit `from=` overrides it. The seed timestamp recomputes only on
  // mount so the visible label is stable for the session.
  const [useDefaultSince, setUseDefaultSince] = useState(true)
  const defaultSince = useMemo(() => isoTwentyFourHoursAgo(), [])
  const filters = useMemo<AuditEventListFilters>(() => {
    if (urlFilters.since !== undefined) return urlFilters
    if (!useDefaultSince) return urlFilters
    return { ...urlFilters, since: defaultSince }
  }, [urlFilters, useDefaultSince, defaultSince])
  const sinceIsDefault =
    urlFilters.since === undefined && useDefaultSince && filters.since === defaultSince

  const [items, setItems] = useState<AuditEvent[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newEventsAvailable, setNewEventsAvailable] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // Reload from latest (cursor=null) when filters change or refresh tick.
  const [refreshTick, setRefreshTick] = useState(0)

  // Use AND of filters but exclude `cursor` — the page reloads from
  // latest when filters change.
  const filterKey = useMemo(() => JSON.stringify(filters), [filters])

  useEffect(() => {
    if (abortRef.current !== null) abortRef.current.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setLoading(true)
    setError(null)
    setNewEventsAvailable(false)

    listAuditEvents({ ...filters, limit: DEFAULT_PAGE_SIZE }, ctrl.signal)
      .then((resp) => {
        setItems(resp.items)
        setNextCursor(resp.next_cursor)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return
        setError(err instanceof Error ? err.message : 'unknown error')
        setLoading(false)
      })

    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, refreshTick])

  // SSE: any event arrival raises the "new events available" affordance.
  // We don't try to match the filter client-side because the user-facing
  // contract is "click to refresh" — over-eager auto-refresh would
  // disrupt scroll position for the operator mid-read.
  useEventBus(ALL_EVENT_KINDS, () => {
    setNewEventsAvailable(true)
  })

  function loadMore() {
    if (nextCursor === null) return
    listAuditEvents({ ...filters, cursor: nextCursor, limit: DEFAULT_PAGE_SIZE })
      .then((resp) => {
        setItems((prev) => [...prev, ...resp.items])
        setNextCursor(resp.next_cursor)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'unknown error')
      })
  }

  function openDrawer(eventId: string) {
    const next = new URLSearchParams(searchParams)
    next.set('event', eventId)
    setSearchParams(next, { replace: true })
  }

  function closeDrawer() {
    const next = new URLSearchParams(searchParams)
    next.delete('event')
    setSearchParams(next, { replace: true })
  }

  function clearAll() {
    // Drop the default-since alongside URL filters so the operator's
    // 'clear everything' intent is honored (rather than the default
    // silently reapplying on the next render).
    setUseDefaultSince(false)
    setSearchParams(new URLSearchParams())
  }

  // hasAnyFilter is true whenever the URL carries an operator-set filter.
  // The in-memory default-since does NOT count — its presence is a
  // sensible default, not a constraint the operator chose, and it
  // shouldn't gate the 'Clear all filters' button or the empty-state copy.
  const hasAnyFilter = Object.keys(urlFilters).length > 0

  return (
    <div className={styles.page} data-testid="audit-ledger-page">
      <h1 className={styles.title}>Audit ledger</h1>
      <p className={styles.hint}>
        Every state mutation in the substrate, newest first. Filter by
        entity, type, actor, time window, or free-text rationale search.
      </p>

      <FilterBar
        filters={filters}
        onChange={(next) => {
          // Drop the `event` and `cursor` params when filters change;
          // the page reloads from latest and the drawer is independent.
          const params = filtersToParams(next)
          const evt = searchParams.get('event')
          if (evt !== null) params.set('event', evt)
          // Any operator-touched `since` (set or cleared explicitly) takes
          // over from the default; the URL becomes the source of truth.
          if (next.since !== urlFilters.since) {
            setUseDefaultSince(false)
          }
          setSearchParams(params)
        }}
        onClearAll={clearAll}
        hasAnyFilter={hasAnyFilter}
      />

      <div className={styles.statusStrip}>
        {filters.since !== undefined && (
          <span data-testid="audit-ledger-since-badge">
            {sinceIsDefault
              ? `Showing events from the last 24 hours · from=${filters.since}`
              : `Since ${filters.since}`}
          </span>
        )}
        {newEventsAvailable && (
          <button
            type="button"
            className={styles.newBadge}
            onClick={() => setRefreshTick((t) => t + 1)}
            data-testid="audit-ledger-new-events"
          >
            New events available — click to refresh
          </button>
        )}
      </div>

      {loading && items.length === 0 ? (
        <p className={styles.empty} data-testid="audit-ledger-loading">
          Loading events…
        </p>
      ) : error !== null ? (
        <p className={styles.error} role="alert" data-testid="audit-ledger-error">
          Failed to load events: {error}
        </p>
      ) : items.length === 0 ? (
        <p className={styles.empty} data-testid="audit-ledger-empty">
          {hasAnyFilter
            ? 'No events match the current filter.'
            : 'No events recorded yet — the substrate ledger is empty.'}
        </p>
      ) : (
        <>
          <ResultsTable items={items} onRowClick={openDrawer} />
          {nextCursor !== null && (
            <button
              type="button"
              className={styles.loadMore}
              onClick={loadMore}
              data-testid="audit-ledger-load-more"
            >
              Load more
            </button>
          )}
        </>
      )}

      {drawerEventId !== null && (
        <EventDetailDrawer eventId={drawerEventId} onClose={closeDrawer} />
      )}
    </div>
  )
}

// --- FilterBar ------------------------------------------------------

interface FilterBarProps {
  filters: AuditEventListFilters
  onChange: (next: AuditEventListFilters) => void
  onClearAll: () => void
  hasAnyFilter: boolean
}

function FilterBar({ filters, onChange, onClearAll, hasAnyFilter }: FilterBarProps) {
  function update<K extends keyof AuditEventListFilters>(
    key: K,
    value: AuditEventListFilters[K] | undefined,
  ) {
    const next: AuditEventListFilters = { ...filters }
    if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
      delete next[key]
    } else {
      next[key] = value
    }
    onChange(next)
  }

  return (
    <div className={styles.filters} data-testid="audit-ledger-filters">
      <div className={styles.filterRow}>
        <label className={styles.filterLabel} htmlFor="f-kind">Entity kind</label>
        <select
          id="f-kind"
          className={styles.filterSelect}
          value={filters.entity_kind ?? ''}
          onChange={(e) => update('entity_kind', e.target.value || undefined)}
          data-testid="audit-ledger-filter-entity-kind"
        >
          {ENTITY_KIND_OPTIONS.map((k) => (
            <option key={k} value={k}>
              {k === '' ? 'Any' : k}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.filterRow}>
        <label className={styles.filterLabel} htmlFor="f-type">Event type</label>
        <input
          id="f-type"
          type="text"
          className={styles.filterInput}
          placeholder="e.g. BugResolved"
          value={typeof filters.type === 'string' ? filters.type : (filters.type?.[0] ?? '')}
          onChange={(e) => update('type', e.target.value || undefined)}
          data-testid="audit-ledger-filter-type"
        />
      </div>

      <div className={styles.filterRow}>
        <label className={styles.filterLabel} htmlFor="f-project">Project</label>
        <input
          id="f-project"
          type="text"
          className={styles.filterInput}
          placeholder="e.g. mcp-servers"
          value={filters.project ?? ''}
          onChange={(e) => update('project', e.target.value || undefined)}
          data-testid="audit-ledger-filter-project"
        />
      </div>

      <div className={styles.filterRow}>
        <label className={styles.filterLabel} htmlFor="f-actor-kind">Actor</label>
        <select
          id="f-actor-kind"
          className={styles.filterSelect}
          value={filters.actor_kind ?? ''}
          onChange={(e) => update('actor_kind', e.target.value || undefined)}
          data-testid="audit-ledger-filter-actor-kind"
        >
          {ACTOR_KIND_OPTIONS.map((k) => (
            <option key={k} value={k}>
              {k === '' ? 'Any' : k}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.filterRow}>
        <label className={styles.filterLabel} htmlFor="f-span">Span ID</label>
        <input
          id="f-span"
          type="text"
          className={styles.filterInput}
          placeholder="UUIDv4"
          value={filters.span_id ?? ''}
          onChange={(e) => update('span_id', e.target.value || undefined)}
          data-testid="audit-ledger-filter-span-id"
        />
      </div>

      <div className={styles.filterRow}>
        <label className={styles.filterLabel} htmlFor="f-since">Since</label>
        <input
          id="f-since"
          type="datetime-local"
          className={styles.filterInput}
          value={isoToLocalInput(filters.since)}
          onChange={(e) => update('since', localInputToIso(e.target.value))}
          data-testid="audit-ledger-filter-since"
        />
      </div>

      <div className={styles.filterRow}>
        <label className={styles.filterLabel} htmlFor="f-until">Until</label>
        <input
          id="f-until"
          type="datetime-local"
          className={styles.filterInput}
          value={isoToLocalInput(filters.until)}
          onChange={(e) => update('until', localInputToIso(e.target.value))}
          data-testid="audit-ledger-filter-until"
        />
      </div>

      <div className={styles.filterRow}>
        <label className={styles.filterLabel} htmlFor="f-q">Rationale search</label>
        <input
          id="f-q"
          type="search"
          className={styles.filterInput}
          placeholder="free-text"
          value={filters.q ?? ''}
          onChange={(e) => update('q', e.target.value || undefined)}
          data-testid="audit-ledger-filter-q"
        />
      </div>

      <div className={styles.filterActions}>
        {hasAnyFilter && (
          <button
            type="button"
            className={styles.actionBtn}
            onClick={onClearAll}
            data-testid="audit-ledger-clear-filters"
          >
            Clear all filters
          </button>
        )}
      </div>
    </div>
  )
}

// --- ResultsTable ---------------------------------------------------

function ResultsTable({
  items,
  onRowClick,
}: {
  items: AuditEvent[]
  onRowClick: (eventId: string) => void
}) {
  return (
    <table className={styles.table} data-testid="audit-ledger-table">
      <thead>
        <tr>
          <th>When</th>
          <th>Entity</th>
          <th>Type</th>
          <th>Actor</th>
          <th>Rationale</th>
          <th>Span</th>
        </tr>
      </thead>
      <tbody>
        {items.map((evt) => (
          <tr
            key={evt.event_id}
            className={styles.row}
            onClick={() => onRowClick(evt.event_id)}
            data-testid={`audit-ledger-row-${evt.event_id}`}
            aria-label={`Open ${evt.type} event details`}
          >
            <td>{formatTs(evt.ts)}</td>
            <td className={styles.cellEntity}>
              <EntityTimelineLink
                entity={evt.entity}
                relatedEntities={evt.related_entities}
                testIDSuffix={evt.event_id}
              >
                {evt.entity.kind}/{evt.entity.slug}
              </EntityTimelineLink>
            </td>
            <td className={styles.cellType}>{evt.type}</td>
            <td>
              {evt.actor.kind}:{evt.actor.id}
            </td>
            <td className={styles.cellRationale} title={evt.rationale ?? ''}>
              {evt.rationale ?? '—'}
            </td>
            <td className={styles.cellSpan}>{shortenSpan(evt.span_id)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// --- EventDetailDrawer ----------------------------------------------

export function EventDetailDrawer({
  eventId,
  onClose,
}: {
  eventId: string
  onClose: () => void
}) {
  const [detail, setDetail] = useState<AuditEventDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (abortRef.current !== null) abortRef.current.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    setError(null)

    getAuditEvent(eventId, ctrl.signal)
      .then((d) => {
        setDetail(d)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return
        setError(err instanceof Error ? err.message : 'unknown error')
        setLoading(false)
      })

    return () => ctrl.abort()
  }, [eventId])

  // Escape closes the drawer.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    function handle(e: KeyboardEvent) {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [])

  const context = useMemo(
    () => ({
      refs: {
        caused_by_event_id: detail?.caused_by_event_id ?? null,
        related_entities: detail?.related_entities ?? [],
      },
    }),
    [detail],
  )

  return (
    <>
      <div
        className={styles.drawerOverlay}
        onClick={onClose}
        data-testid="event-detail-drawer-overlay"
      />
      <aside
        className={styles.drawer}
        role="dialog"
        aria-labelledby="drawer-title"
        data-testid="event-detail-drawer"
      >
        <div className={styles.drawerHeader}>
          <h2 id="drawer-title" className={styles.drawerTitle}>
            {detail !== null
              ? `${detail.type} · ${detail.entity.kind}/${detail.entity.slug}`
              : loading
                ? 'Loading…'
                : 'Event'}
          </h2>
          <button
            type="button"
            className={styles.drawerClose}
            onClick={onClose}
            aria-label="Close drawer"
            data-testid="event-detail-drawer-close"
          >
            ×
          </button>
        </div>

        {loading ? (
          <p data-testid="event-detail-drawer-loading">Loading…</p>
        ) : error !== null ? (
          <p className={styles.error} role="alert" data-testid="event-detail-drawer-error">
            {error}
          </p>
        ) : detail === null ? null : (
          <>
            <div className={styles.drawerSection}>
              <span className={styles.drawerSectionLabel}>When</span>
              <span>{detail.ts}</span>
            </div>

            <div className={styles.drawerSection}>
              <span className={styles.drawerSectionLabel}>Actor</span>
              <span>
                {detail.actor.kind}:{detail.actor.id}
              </span>
            </div>

            {detail.rationale !== null && detail.rationale !== '' && (
              <div className={styles.drawerSection}>
                <span className={styles.drawerSectionLabel}>Rationale</span>
                <p className={styles.drawerRationale} data-testid="event-detail-drawer-rationale">
                  {detail.rationale}
                </p>
              </div>
            )}

            <div className={styles.drawerSection}>
              <span className={styles.drawerSectionLabel}>Payload</span>
              <div data-testid="event-detail-drawer-payload">
                {renderEventPayload(detail.type, detail.payload, context)}
              </div>
            </div>

            <div className={styles.drawerSection}>
              <span className={styles.drawerSectionLabel}>Span</span>
              <a
                className={styles.cellSpan}
                href={`/spans?span_id=${encodeURIComponent(detail.span_id)}`}
                data-testid="event-detail-drawer-span-link"
              >
                {detail.span_id}
              </a>
            </div>

            <div className={styles.drawerSection}>
              <span className={styles.drawerSectionLabel}>Related queries</span>
              <RelatedQueriesBlock related={detail.related_queries} />
            </div>

            <div className={styles.drawerSection}>
              <span className={styles.drawerSectionLabel}>Deep links</span>
              <DeepLinksBlock
                entity={detail.entity}
                relatedEntities={detail.related_entities}
              />
            </div>
          </>
        )}
      </aside>
    </>
  )
}

function RelatedQueriesBlock({
  related,
}: {
  related: RelatedQuery[] | null
}) {
  if (related === null) {
    return (
      <p
        className={styles.drawerEmpty}
        data-testid="event-detail-drawer-related-queries-absent"
      >
        Telemetry data not available — query-telemetry-substrate has not
        been deployed yet.
      </p>
    )
  }
  if (related.length === 0) {
    return (
      <p
        className={styles.drawerEmpty}
        data-testid="event-detail-drawer-related-queries-empty"
      >
        No related queries for this event.
      </p>
    )
  }
  return (
    <table
      className={styles.relatedQueriesTable}
      data-testid="event-detail-drawer-related-queries"
    >
      <thead>
        <tr>
          <th>Entity</th>
          <th>Outcome</th>
        </tr>
      </thead>
      <tbody>
        {related.map((q) => (
          <tr key={q.resolution_id}>
            <td>
              <span className={styles.relatedQueryEntityKind}>
                {q.entity_kind}
              </span>{' '}
              {q.entity_slug}
            </td>
            <td>{q.outcome_kind}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// --- URL ↔ filter mapping --------------------------------------------

// Short param names per design doc §9.1.
const PARAM_KEYS = {
  k: 'entity_kind',
  slug: 'entity_slug',
  t: 'type',
  p: 'project',
  s: 'span_id',
  ak: 'actor_kind',
  aid: 'actor_id',
  from: 'since',
  to: 'until',
  q: 'q',
  c: 'cursor',
} as const

function paramsToFilters(params: URLSearchParams): AuditEventListFilters {
  const f: AuditEventListFilters = {}
  for (const [shortKey, fullKey] of Object.entries(PARAM_KEYS) as [
    keyof typeof PARAM_KEYS,
    keyof AuditEventListFilters,
  ][]) {
    const v = params.get(shortKey)
    if (v !== null && v !== '') {
      // type can be repeated; expand into array when multiple.
      if (fullKey === 'type') {
        const all = params.getAll(shortKey)
        ;(f as AuditEventListFilters).type = all.length > 1 ? all : all[0]
      } else {
        // String fields all share the same shape; assign with a cast.
        ;(f as Record<string, unknown>)[fullKey] = v
      }
    }
  }
  return f
}

function filtersToParams(filters: AuditEventListFilters): URLSearchParams {
  const params = new URLSearchParams()
  for (const [shortKey, fullKey] of Object.entries(PARAM_KEYS) as [
    keyof typeof PARAM_KEYS,
    keyof AuditEventListFilters,
  ][]) {
    const value = filters[fullKey]
    if (value === undefined || value === '') continue
    if (Array.isArray(value)) {
      for (const v of value) params.append(shortKey, String(v))
    } else {
      params.set(shortKey, String(value))
    }
  }
  return params
}

// --- formatting helpers ---------------------------------------------

function formatTs(iso: string): string {
  const m = iso.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/)
  return m !== null ? m[1].replace('T', ' ') : iso
}

function shortenSpan(id: string): string {
  if (id.length <= 12) return id
  return id.slice(0, 8) + '…'
}

function isoToLocalInput(iso: string | undefined): string {
  if (iso === undefined) return ''
  // Strip the timezone suffix; <input type="datetime-local"> uses
  // YYYY-MM-DDTHH:MM (no TZ, no seconds).
  const m = iso.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/)
  return m !== null ? m[1] : ''
}

function localInputToIso(local: string): string | undefined {
  if (local === '') return undefined
  // Assume the operator's local time, convert to ISO with seconds + Z.
  // For audit-ledger filtering this is approximate; precision is not the
  // primary concern (since/until are time-bound windows, not exact pins).
  const d = new Date(local)
  if (isNaN(d.getTime())) return undefined
  return d.toISOString().replace(/\.\d{3}Z$/, '.000Z')
}

// entityTimelinePath returns the deep-link path for an entity's detail
// view, or null when the entity kind has no dedicated route (e.g.
// benchmark_run / benchmark_metric). Per F1 §7.6:
//   bug   → /bugs?slug=<slug>
//   chain → /tasks/chains?chain=<slug>
//   task  → /tasks/chains?chain=<parent>&task=<slug> when the parent
//           chain is in related_entities; otherwise ?task=<slug> only
// Other entity kinds (benchmark_run, benchmark_metric, etc.) return
// null so the caller can suppress the link.
export function entityTimelinePath(
  entity: AuditEntity,
  relatedEntities: AuditEntityRef[],
): string | null {
  switch (entity.kind) {
    case 'bug':
      return `/bugs?slug=${encodeURIComponent(entity.slug)}`
    case 'suggestion':
      return `/suggestions?slug=${encodeURIComponent(entity.slug)}`
    case 'chain':
      return `/tasks/chains?chain=${encodeURIComponent(entity.slug)}`
    case 'task': {
      const parentChain = relatedEntities.find((r) => r.kind === 'chain')
      if (parentChain !== undefined) {
        return `/tasks/chains?chain=${encodeURIComponent(parentChain.slug)}&task=${encodeURIComponent(entity.slug)}`
      }
      return `/tasks/chains?task=${encodeURIComponent(entity.slug)}`
    }
    default:
      return null
  }
}

// EntityTimelineLink wraps the entity-column label in an anchor pointing
// to entityTimelinePath. Click is `stopPropagation`d so the surrounding
// row's drawer-open onClick stays dormant — operators get distinct
// affordances: row body opens the drawer, entity column jumps to the
// timeline. When the entity kind has no dedicated route, falls back to
// rendering plain text (no anchor) so the table never produces a dead
// link.
function EntityTimelineLink({
  entity,
  relatedEntities,
  testIDSuffix,
  children,
}: {
  entity: AuditEntity
  relatedEntities: AuditEntityRef[]
  testIDSuffix: string
  children: React.ReactNode
}) {
  const href = entityTimelinePath(entity, relatedEntities)
  if (href === null) {
    return <span data-testid={`audit-ledger-entity-${testIDSuffix}-plain`}>{children}</span>
  }
  return (
    <a
      href={href}
      onClick={(e) => e.stopPropagation()}
      data-testid={`audit-ledger-entity-${testIDSuffix}-link`}
    >
      {children}
    </a>
  )
}

// DeepLinksBlock renders the drawer's Deep links section. Today the
// only deep link is the entity timeline; F1 §7.6 leaves the section
// open for future cross-substrate links (e.g. into the spans tree,
// telemetry trajectories). Single-link case still uses a list shape
// so adding a sibling doesn't restructure the surrounding layout.
function DeepLinksBlock({
  entity,
  relatedEntities,
}: {
  entity: AuditEntity
  relatedEntities: AuditEntityRef[]
}) {
  const href = entityTimelinePath(entity, relatedEntities)
  if (href === null) {
    return (
      <p
        className={styles.drawerEmpty}
        data-testid="event-detail-drawer-deep-links-empty"
      >
        No deep link available for entity kind '{entity.kind}'.
      </p>
    )
  }
  return (
    <ul data-testid="event-detail-drawer-deep-links">
      <li>
        <a href={href} data-testid="event-detail-drawer-entity-timeline-link">
          View entity timeline →
        </a>
      </li>
    </ul>
  )
}

// isoTwentyFourHoursAgo returns the ISO-8601 timestamp 24 hours before
// now, normalised to the same `.000Z` shape localInputToIso writes so
// the default and operator-set values round-trip identically through
// the URL.
function isoTwentyFourHoursAgo(): string {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000)
  return d.toISOString().replace(/\.\d{3}Z$/, '.000Z')
}


