import { get } from '../lib/http'
import type {
  AnalyticsSuccessResponse,
  AnalyticsVolumeResponse,
  SegmentAxis,
  TrainingPairsResponse,
  TrainingPairsStatsResponse,
  TrajectoryBySpanResponse,
  TrajectoryResponse,
} from '../lib/telemetry'

export interface AnalyticsRangeFilters {
  segment: SegmentAxis
  since?: string
  until?: string
  project?: string
}

export interface TrainingPairsFilters {
  label_kind?: string[]
  query_source?: string[]
  project?: string
  q?: string
  cursor?: number
  limit?: number
}

/**
 * GET /telemetry/trajectories/{queryId} — per-query full audit.
 * The trajectory endpoint composes query metadata, result set,
 * query_interactions, and query_resolutions in one server-side trip.
 * See docs/TELEMETRY_FRONTEND.md §3.1.
 */
export async function getTrajectoryByQueryId(
  queryId: number,
  signal?: AbortSignal,
): Promise<TrajectoryResponse> {
  return get<TrajectoryResponse>(
    `/telemetry/trajectories/${encodeURIComponent(String(queryId))}`,
    signal,
  )
}

/**
 * GET /telemetry/trajectories?span_id=<uuid> — same shape as
 * getTrajectoryByQueryId but keyed on per-tools/call span_id, which can
 * legally fan to multiple grounding_events (e.g. one span fires
 * vault_search and kiwix_search). The response wraps the list under
 * `trajectories`.
 */
export async function getTrajectoryBySpanId(
  spanId: string,
  signal?: AbortSignal,
): Promise<TrajectoryBySpanResponse> {
  const params = new URLSearchParams({ span_id: spanId })
  return get<TrajectoryBySpanResponse>(
    `/telemetry/trajectories?${params.toString()}`,
    signal,
  )
}

/** GET /telemetry/analytics/volume-by-source — chart-ready volume
 *  time-series per design §3.2. */
export async function getVolumeBySource(
  filters: AnalyticsRangeFilters,
  signal?: AbortSignal,
): Promise<AnalyticsVolumeResponse> {
  return get<AnalyticsVolumeResponse>(
    `/telemetry/analytics/volume-by-source${buildAnalyticsQuery(filters)}`,
    signal,
  )
}

/** GET /telemetry/analytics/success-rate — same shape as volume,
 *  but each segment cell carries (query_count, success_count,
 *  success_rate) per design §3.3. */
export async function getSuccessRate(
  filters: AnalyticsRangeFilters,
  signal?: AbortSignal,
): Promise<AnalyticsSuccessResponse> {
  return get<AnalyticsSuccessResponse>(
    `/telemetry/analytics/success-rate${buildAnalyticsQuery(filters)}`,
    signal,
  )
}

/** GET /telemetry/training-pairs — paginated training-pair browser
 *  per design §3.4. */
export async function getTrainingPairs(
  filters: TrainingPairsFilters = {},
  signal?: AbortSignal,
): Promise<TrainingPairsResponse> {
  const params = new URLSearchParams()
  for (const v of filters.label_kind ?? []) params.append('label_kind', v)
  for (const v of filters.query_source ?? []) params.append('query_source', v)
  if (filters.project !== undefined && filters.project !== '')
    params.set('project', filters.project)
  if (filters.q !== undefined && filters.q !== '') params.set('q', filters.q)
  if (filters.cursor !== undefined)
    params.set('cursor', String(filters.cursor))
  if (filters.limit !== undefined) params.set('limit', String(filters.limit))
  const qs = params.toString()
  return get<TrainingPairsResponse>(
    `/telemetry/training-pairs${qs === '' ? '' : `?${qs}`}`,
    signal,
  )
}

/** GET /telemetry/training-pairs/stats — corpus-shape banner; honors
 *  the same filter axes so distribution updates as the user narrows.
 *  Per design §3.5. */
export async function getTrainingPairsStats(
  filters: Omit<TrainingPairsFilters, 'cursor' | 'limit' | 'q'> = {},
  signal?: AbortSignal,
): Promise<TrainingPairsStatsResponse> {
  const params = new URLSearchParams()
  for (const v of filters.label_kind ?? []) params.append('label_kind', v)
  for (const v of filters.query_source ?? []) params.append('query_source', v)
  if (filters.project !== undefined && filters.project !== '')
    params.set('project', filters.project)
  const qs = params.toString()
  return get<TrainingPairsStatsResponse>(
    `/telemetry/training-pairs/stats${qs === '' ? '' : `?${qs}`}`,
    signal,
  )
}

function buildAnalyticsQuery(filters: AnalyticsRangeFilters): string {
  const params = new URLSearchParams({ segment: filters.segment })
  if (filters.since !== undefined && filters.since !== '')
    params.set('since', filters.since)
  if (filters.until !== undefined && filters.until !== '')
    params.set('until', filters.until)
  if (filters.project !== undefined && filters.project !== '')
    params.set('project', filters.project)
  return `?${params.toString()}`
}
