import { get } from '../lib/http'
import { withProjectQuery } from '../hooks/useProject'
import { getCounts } from './counts'
import type {
  SuggestionDetail,
  SuggestionListResponse,
  SuggestionListRow,
  SuggestionResolutionMix,
} from '../lib/suggestionIndex'
import type { SuggestionRow } from './types.gen'

export interface SuggestionFilters {
  status?: string
  priority?: string
  surface?: string
  signal?: AbortSignal
  project?: string
}

function adaptSuggestionRow(row: SuggestionRow): SuggestionListRow {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    status: row.status,
    surface: row.surface,
    priority: row.priority,
    routed_chain_slug: row.routed_chain_slug,
    routed_task_slug: row.routed_task_slug,
    routed_bug_slug: row.routed_bug_slug,
    resolved_commit_sha: row.resolved_commit_sha,
    filed_at: row.filed_at,
    resolved_at: row.resolved_at,
    project_id: row.project_id,
  }
}

export async function listSuggestions(
  filters?: SuggestionFilters,
): Promise<SuggestionListResponse> {
  const params = new URLSearchParams()
  if (filters?.status) params.set('status', filters.status)
  if (filters?.priority) params.set('priority', filters.priority)
  if (filters?.surface) params.set('surface', filters.surface)
  let path = params.size > 0 ? `/suggestions?${params}` : '/suggestions'
  path = withProjectQuery(path, filters?.project)
  const rows = await get<SuggestionRow[]>(path, filters?.signal)
  return { suggestions: rows.map(adaptSuggestionRow), count: rows.length }
}

/**
 * Read a single suggestion by slug. observe-http has no
 * `/suggestions/<slug>` endpoint today — the bug-side pattern is the
 * same: filter the list response client-side. Fields the list response
 * doesn't carry (problem_statement, source, acceptance_criteria,
 * constraints, resolution_note, resolution_kind) default to empty
 * strings / nulls. Future: route through `mcp__toolkit-server__work
 * suggestion_read` for the full body once the dashboard's MCP-proxy
 * surface picks that up; for now the list-row projection is enough for
 * the detail-pane shell to land.
 */
export async function readSuggestion(
  slug: string,
  opts: { signal?: AbortSignal; project?: string } = {},
): Promise<SuggestionDetail> {
  const path = withProjectQuery('/suggestions', opts.project)
  const rows = await get<SuggestionRow[]>(path, opts.signal)
  const row = rows.find(r => r.slug === slug)
  if (!row) {
    throw new Error(`suggestion '${slug}' not found`)
  }
  // resolution_note retired in migration 065 (Phase 4 F2). Surfaced
  // via the SuggestionResolved event payload in the EventTimeline only.
  return {
    slug: row.slug,
    title: row.title,
    problem_statement: '',
    surface: row.surface,
    priority: row.priority,
    source: '',
    acceptance_criteria: '',
    constraints: '',
    status: row.status,
    resolution_kind: null,
    routed_chain_slug: row.routed_chain_slug,
    routed_task_slug: row.routed_task_slug,
    routed_bug_slug: row.routed_bug_slug,
    resolved_commit_sha: row.resolved_commit_sha,
    filed_at: row.filed_at,
    resolved_at: row.resolved_at,
    project_id: row.project_id,
  }
}

/**
 * Corpus-wide suggestion status mix. Reads the aggregate endpoint via
 * the shared counts module — TRUE counts regardless of the list
 * endpoint's 1000-row cap. See api/counts.ts for the architectural
 * note + api/bugs.ts.getBugResolutionMix for the parallel.
 */
export async function getSuggestionResolutionMix(
  opts: { signal?: AbortSignal; project?: string } = {},
): Promise<SuggestionResolutionMix> {
  const resp = await getCounts('suggestions', {
    groupBy: 'status',
    project: opts.project,
    signal: opts.signal,
  })
  const buckets = resp.buckets ?? {}
  return {
    open: buckets['open'] ?? 0,
    adopted: buckets['adopted'] ?? 0,
    deferred: buckets['deferred'] ?? 0,
    rejected: buckets['rejected'] ?? 0,
  }
}
