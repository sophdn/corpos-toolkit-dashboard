import { get } from '../lib/http'
import type {
  AuditEntityKind,
  AuditEventDetail,
  AuditEventListFilters,
  AuditEventListResponse,
} from '../lib/auditEvents'

/**
 * GET /events/list — paginated, filterable list of substrate events.
 *
 * Filter keys map directly to the Go handler's query params; multi-value
 * `type` becomes repeated `type=…&type=…`. Cursor pagination is on
 * `event_id`; the `next_cursor` field of the response is the input for
 * the subsequent page.
 *
 * See docs/SUBSTRATE_FRONTEND.md §2.1 and §3 for the contract.
 */
export async function listAuditEvents(
  filters: AuditEventListFilters = {},
  signal?: AbortSignal,
): Promise<AuditEventListResponse> {
  const qs = buildQueryString(filters)
  return get<AuditEventListResponse>(`/events/list${qs}`, signal)
}

/**
 * GET /entities/{kind}/{slug}/events — chronological timeline for one
 * entity. Cursor pagination (ascending). The `project` filter is
 * required-ish: entity slugs are not globally unique across projects,
 * but the endpoint tolerates absence and returns a cross-project view
 * if the caller doesn't supply it.
 *
 * See docs/SUBSTRATE_FRONTEND.md §2.3.
 */
export async function listEntityAuditEvents(
  kind: AuditEntityKind,
  slug: string,
  filters: AuditEventListFilters = {},
  signal?: AbortSignal,
): Promise<AuditEventListResponse> {
  const qs = buildQueryString(filters)
  return get<AuditEventListResponse>(
    `/entities/${encodeURIComponent(kind)}/${encodeURIComponent(slug)}/events${qs}`,
    signal,
  )
}

/**
 * GET /events/{event_id} — single event detail plus optional
 * cross-substrate join. `related_queries: null` signals the
 * query-telemetry-substrate sibling table is absent; `[]` means present
 * but no matches.
 */
export async function getAuditEvent(
  eventId: string,
  signal?: AbortSignal,
): Promise<AuditEventDetail> {
  return get<AuditEventDetail>(
    `/events/${encodeURIComponent(eventId)}`,
    signal,
  )
}

function buildQueryString(filters: AuditEventListFilters): string {
  const params = new URLSearchParams()
  const set = (k: string, v: string | undefined) => {
    if (v !== undefined && v !== '') params.append(k, v)
  }
  set('entity_kind', filters.entity_kind)
  set('entity_slug', filters.entity_slug)
  if (Array.isArray(filters.type)) {
    for (const t of filters.type) params.append('type', t)
  } else {
    set('type', filters.type)
  }
  set('project', filters.project)
  set('span_id', filters.span_id)
  set('actor_kind', filters.actor_kind)
  set('actor_id', filters.actor_id)
  set('since', filters.since)
  set('until', filters.until)
  set('q', filters.q)
  set('cursor', filters.cursor)
  if (filters.limit !== undefined) params.set('limit', String(filters.limit))
  const s = params.toString()
  return s === '' ? '' : `?${s}`
}
