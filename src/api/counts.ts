import { get } from '../lib/http'
import { withProjectQuery } from '../hooks/useProject'

/**
 * Counts module — the single source of truth for record-count
 * surfaces on the dashboard. Every page that wants to display
 * "X bugs", "Y open suggestions", a status breakdown widget, etc.
 * SHOULD call into this module rather than counting the rows
 * returned from `listBugs` / `listSuggestions` / etc.
 *
 * Backstory: the list endpoints (`/bugs`, `/suggestions`) cap at
 * 1000 rows. Anything that counted `rows.length` silently undercapped
 * for any corpus larger than that. The truth lives on the backend's
 * aggregate endpoints `/{resource}/counts` (see
 * go/internal/observehttp/counts.go).
 *
 * Backend response shape (from observehttp.countResponse):
 *   ungrouped → { total: N }
 *   grouped   → { total: N, group_by: "<col>", buckets: { ... } }
 */

export type Resource = 'bugs' | 'suggestions' | 'tasks' | 'chains'

export interface CountFilters {
  status?: string
  severity?: string
  priority?: string
  surface?: string
  chain_slug?: string
  chain_status?: string
  project?: string
  signal?: AbortSignal
}

export interface CountOptions extends CountFilters {
  /** Optional column to group by. Allowed values vary per resource —
   * see the resource's backend handler for the validated list.
   * Examples: 'status', 'severity', 'priority', 'project_id'. */
  groupBy?: string
}

export interface CountResponse {
  total: number
  group_by?: string
  buckets?: Record<string, number>
}

/** filterKeys is the explicit list of query-string filters the
 * backend's /counts handlers recognise. Centralised so adding a new
 * filter in only one place (a backend handler + this list) keeps the
 * module consistent. */
const FILTER_KEYS = [
  'status',
  'severity',
  'priority',
  'surface',
  'chain_slug',
  'chain_status',
] as const satisfies readonly (keyof CountFilters)[]

export async function getCounts(
  resource: Resource,
  opts: CountOptions = {},
): Promise<CountResponse> {
  const params = new URLSearchParams()
  for (const key of FILTER_KEYS) {
    const v = opts[key]
    if (v) params.set(key, v)
  }
  if (opts.groupBy) params.set('group_by', opts.groupBy)
  const tail = params.size > 0 ? `?${params}` : ''
  const path = withProjectQuery(`/${resource}/counts${tail}`, opts.project)
  return get<CountResponse>(path, opts.signal)
}
