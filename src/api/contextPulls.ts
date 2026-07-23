import { get } from '../lib/http'
import type {
  ContextPullByEntityResponse,
  ContextPullDetail,
  ContextPullListResponse,
  ContextPullSegment,
  ContextPullStatsResponse,
  ContextPullsTimeseriesResponse,
} from '../lib/contextPulls'

/**
 * Client for the /context-pulls/* endpoints shipped in RF2
 * (go/internal/observehttp/context_pulls.go). See
 * docs/REFERENCE_RESOLUTION_FRONTEND.md §3.
 *
 * FOUR-AXIS DISCIPLINE: filter param names match exact column names —
 * query_source / shape / confidence_tier / source_type. NO bare
 * source / kind.
 */

export interface ContextPullListFilters {
  /** When omitted, the server defaults to ['reference_resolution']. */
  query_source?: string[]
  shape?: string[]
  confidence_tier?: string[]
  source_type?: string[]
  session_id?: string
  prompt_id?: string
  span_id?: string
  project?: string
  /** Free-text search on the detected token (query_text column). */
  q?: string
  since?: string
  until?: string
  cursor?: number
  limit?: number
}

export type ContextPullStatsFilters = Omit<
  ContextPullListFilters,
  'cursor' | 'limit'
>

export interface ContextPullTimeseriesFilters extends ContextPullStatsFilters {
  segment: ContextPullSegment
}

/** GET /context-pulls — paginated, filterable list. */
export async function listContextPulls(
  filters: ContextPullListFilters = {},
  signal?: AbortSignal,
): Promise<ContextPullListResponse> {
  const qs = buildListQuery(filters)
  return get<ContextPullListResponse>(
    `/context-pulls${qs === '' ? '' : `?${qs}`}`,
    signal,
  )
}

/** GET /context-pulls/{grounding_event_id} — drawer detail. */
export async function getContextPullDetail(
  groundingEventId: number,
  signal?: AbortSignal,
): Promise<ContextPullDetail> {
  return get<ContextPullDetail>(
    `/context-pulls/${encodeURIComponent(String(groundingEventId))}`,
    signal,
  )
}

/** GET /context-pulls/by-entity/{kind}/{slug}?project= — entity-scoped
 *  list joined through query_resolutions.prompt_id per TT1 §2. */
export async function listContextPullsByEntity(
  kind: string,
  slug: string,
  filters: { project: string; outcome_kind?: string; cursor?: number; limit?: number },
  signal?: AbortSignal,
): Promise<ContextPullByEntityResponse> {
  const params = new URLSearchParams({ project: filters.project })
  if (filters.outcome_kind !== undefined && filters.outcome_kind !== '')
    params.set('outcome_kind', filters.outcome_kind)
  if (filters.cursor !== undefined) params.set('cursor', String(filters.cursor))
  if (filters.limit !== undefined) params.set('limit', String(filters.limit))
  return get<ContextPullByEntityResponse>(
    `/context-pulls/by-entity/${encodeURIComponent(kind)}/${encodeURIComponent(slug)}?${params.toString()}`,
    signal,
  )
}

/** GET /context-pulls/stats — banner distribution stats. */
export async function getContextPullStats(
  filters: ContextPullStatsFilters = {},
  signal?: AbortSignal,
): Promise<ContextPullStatsResponse> {
  const qs = buildListQuery(filters)
  return get<ContextPullStatsResponse>(
    `/context-pulls/stats${qs === '' ? '' : `?${qs}`}`,
    signal,
  )
}

/** GET /context-pulls/stats/timeseries — daily-bucketed counts. */
export async function getContextPullsTimeseries(
  filters: ContextPullTimeseriesFilters,
  signal?: AbortSignal,
): Promise<ContextPullsTimeseriesResponse> {
  const params = new URLSearchParams({ segment: filters.segment })
  for (const v of filters.query_source ?? []) params.append('query_source', v)
  for (const v of filters.shape ?? []) params.append('shape', v)
  for (const v of filters.confidence_tier ?? [])
    params.append('confidence_tier', v)
  for (const v of filters.source_type ?? []) params.append('source_type', v)
  if (filters.project !== undefined && filters.project !== '')
    params.set('project', filters.project)
  if (filters.since !== undefined && filters.since !== '')
    params.set('since', filters.since)
  if (filters.until !== undefined && filters.until !== '')
    params.set('until', filters.until)
  return get<ContextPullsTimeseriesResponse>(
    `/context-pulls/stats/timeseries?${params.toString()}`,
    signal,
  )
}

function buildListQuery(filters: ContextPullListFilters): string {
  const params = new URLSearchParams()
  for (const v of filters.query_source ?? []) params.append('query_source', v)
  for (const v of filters.shape ?? []) params.append('shape', v)
  for (const v of filters.confidence_tier ?? [])
    params.append('confidence_tier', v)
  for (const v of filters.source_type ?? []) params.append('source_type', v)
  if (filters.session_id !== undefined && filters.session_id !== '')
    params.set('session_id', filters.session_id)
  if (filters.prompt_id !== undefined && filters.prompt_id !== '')
    params.set('prompt_id', filters.prompt_id)
  if (filters.span_id !== undefined && filters.span_id !== '')
    params.set('span_id', filters.span_id)
  if (filters.project !== undefined && filters.project !== '')
    params.set('project', filters.project)
  if (filters.q !== undefined && filters.q !== '') params.set('q', filters.q)
  if (filters.since !== undefined && filters.since !== '')
    params.set('since', filters.since)
  if (filters.until !== undefined && filters.until !== '')
    params.set('until', filters.until)
  if (filters.cursor !== undefined) params.set('cursor', String(filters.cursor))
  if (filters.limit !== undefined) params.set('limit', String(filters.limit))
  return params.toString()
}
