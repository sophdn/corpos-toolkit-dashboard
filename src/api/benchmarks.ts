import { get } from '../lib/http'
import { withProjectQuery } from '../hooks/useProject'
import type { BenchmarkCardsResponse } from '../lib/benchmarkCards'
import type { BenchmarkRubricCardsResponse } from '../lib/benchmarkRubricCards'
import type { BenchmarkTasksResponse } from '../lib/benchmarkTasks'

export interface CardsOptions {
  signal?: AbortSignal
  project?: string
  recent_n?: number
  since?: number
}

/**
 * Fetch the per-shape × per-model card aggregations from
 * `/benchmarks/cards`. Powers the radar card grid (chain
 * `benchmarks-shape-criteria-reshape` T9).
 */
export async function getBenchmarkCards(
  opts: CardsOptions = {},
): Promise<BenchmarkCardsResponse> {
  const params = new URLSearchParams()
  if (opts.recent_n != null) params.set('recent_n', String(opts.recent_n))
  if (opts.since != null) params.set('since', String(opts.since))
  let path = params.size > 0 ? `/benchmarks/cards?${params}` : '/benchmarks/cards'
  path = withProjectQuery(path, opts.project)
  return get<BenchmarkCardsResponse>(path, opts.signal)
}

/**
 * Fetch per-rubric cards from `/benchmarks/rubric-cards`. Mirrors
 * `getBenchmarkCards` but groups by rubric_name. Powers the per-rubric
 * card grid on the Benchmarks page (chain
 * `mcp-servers/extract-now-rubric-foundation` T8).
 */
export async function getBenchmarkRubricCards(
  opts: CardsOptions = {},
): Promise<BenchmarkRubricCardsResponse> {
  const params = new URLSearchParams()
  if (opts.recent_n != null) params.set('recent_n', String(opts.recent_n))
  if (opts.since != null) params.set('since', String(opts.since))
  let path =
    params.size > 0 ? `/benchmarks/rubric-cards?${params}` : '/benchmarks/rubric-cards'
  path = withProjectQuery(path, opts.project)
  return get<BenchmarkRubricCardsResponse>(path, opts.signal)
}

/**
 * Fetch per-task cards from `/benchmarks/tasks`. One card per discrete
 * offload task; supersedes both getBenchmarkCards (per-shape) and
 * getBenchmarkRubricCards (per-rubric, registered only). Powers the
 * post-redesign Benchmarks page (chain
 * `benchmarks-page-per-task-redesign` T3).
 */
export async function getBenchmarkTasks(
  opts: CardsOptions = {},
): Promise<BenchmarkTasksResponse> {
  const params = new URLSearchParams()
  if (opts.recent_n != null) params.set('recent_n', String(opts.recent_n))
  if (opts.since != null) params.set('since', String(opts.since))
  let path = params.size > 0 ? `/benchmarks/tasks?${params}` : '/benchmarks/tasks'
  path = withProjectQuery(path, opts.project)
  return get<BenchmarkTasksResponse>(path, opts.signal)
}
