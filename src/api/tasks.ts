import { get } from '../lib/http'
import { withProjectQuery } from '../hooks/useProject'
import type { TaskContentSearchResponse } from '../lib/chainIndex'
import type { SearchResponse } from './types.gen'

export interface SearchTasksOptions {
  pattern: string
  maxResults?: number
  chainSlug?: string
  chainStatus?: string
  signal?: AbortSignal
  project?: string
}

/**
 * Cross-task content search. Hits the observe-http GET /tasks/search
 * endpoint, which wraps work_lib::tasks::search_tasks_with_snippets.
 *
 * Returns one TaskContentMatch per (task, matching field) pair with a
 * ~200-char snippet centred on the first occurrence of `pattern` in
 * each matching field.
 *
 * Empty pattern resolves with an empty result without making a request
 * (mirrors the server's no-op for pattern="").
 */
export async function searchTasks(
  options: SearchTasksOptions,
  signal?: AbortSignal,
): Promise<TaskContentSearchResponse> {
  if (!options.pattern.trim()) {
    return { count: 0, truncated: false, pattern: options.pattern, matches: [] }
  }
  const params = new URLSearchParams()
  params.set('pattern', options.pattern)
  if (options.chainSlug) params.set('chain_slug', options.chainSlug)
  if (options.chainStatus) params.set('chain_status', options.chainStatus)
  if (options.maxResults != null) params.set('max_results', String(options.maxResults))
  let path = `/tasks/search?${params}`
  path = withProjectQuery(path, options.project)
  // Wire shape (SearchResponse from types.gen) is structurally
  // identical to TaskContentSearchResponse the dashboard consumes —
  // the cast pins the codegen-freshness gate to /tasks/search too.
  const resp = await get<SearchResponse>(path, signal ?? options.signal)
  return resp as TaskContentSearchResponse
}
