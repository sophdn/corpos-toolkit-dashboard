import { get } from '../lib/http'
import { withProjectQuery } from '../hooks/useProject'
import { getCounts } from './counts'
import type {
  BugDetail,
  BugListResponse,
  BugListRow,
  BugResolutionMix,
} from '../lib/bugIndex'
import type { BugRow } from './types.gen'

export interface BugFilters {
  status?: string
  severity?: string
  surface?: string
  signal?: AbortSignal
  project?: string
}

function adaptBugRow(row: BugRow): BugListRow {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    status: row.status,
    surface: row.surface,
    severity: row.severity,
    filed_at: row.filed_at,
    resolved_at: row.resolved_at,
    project_id: row.project_id,
  }
}

export async function listBugs(filters?: BugFilters): Promise<BugListResponse> {
  const params = new URLSearchParams()
  if (filters?.status) params.set('status', filters.status)
  if (filters?.severity) params.set('severity', filters.severity)
  if (filters?.surface) params.set('surface', filters.surface)
  let path = params.size > 0 ? `/bugs?${params}` : '/bugs'
  path = withProjectQuery(path, filters?.project)
  const rows = await get<BugRow[]>(path, filters?.signal)
  return { bugs: rows.map(adaptBugRow), count: rows.length }
}

/**
 * Read a single bug by slug. observe-http has no `/bugs/<slug>`
 * endpoint; we fetch the list and filter client-side. Many fields the
 * old `BugDetail` shape carried are not in `/bugs`'s row shape — those
 * default to empty.
 */
export async function readBug(
  slug: string,
  opts: { signal?: AbortSignal; project?: string } = {},
): Promise<BugDetail> {
  const path = withProjectQuery('/bugs', opts.project)
  const rows = await get<BugRow[]>(path, opts.signal)
  const row = rows.find(r => r.slug === slug)
  if (!row) {
    throw new Error(`bug '${slug}' not found`)
  }
  // resolution_note retired in migration 065 (Phase 4 F2). Surfaced
  // via the BugResolved event payload in the EventTimeline only.
  return {
    slug: row.slug,
    title: row.title,
    problem_statement: '',
    surface: row.surface,
    severity: row.severity,
    source: '',
    acceptance_criteria: '',
    constraints: '',
    status: row.status,
    routed_chain_slug: '',
    routed_task_slug: '',
    filed_at: row.filed_at,
    resolved_at: row.resolved_at,
    resolved_commit_sha: null,
    resolved_dirty: null,
    spawned_successor_slug: null,
    recurrence_candidates: null,
    resolution_kind: null,
    project_id: row.project_id,
  }
}

/**
 * Corpus-wide bug status mix. Reads the aggregate endpoint via the
 * shared counts module — TRUE counts regardless of the list endpoint's
 * 1000-row cap. Pre-counts-module versions summed `/bugs` client-side
 * and silently undercapped any corpus >1000.
 */
export async function getBugResolutionMix(
  opts: { signal?: AbortSignal; project?: string } = {},
): Promise<BugResolutionMix> {
  const resp = await getCounts('bugs', {
    groupBy: 'status',
    project: opts.project,
    signal: opts.signal,
  })
  const buckets = resp.buckets ?? {}
  return {
    open: buckets['open'] ?? 0,
    fixed: buckets['fixed'] ?? 0,
    wontfix: buckets['wontfix'] ?? 0,
    upstream: buckets['upstream'] ?? 0,
    routed: buckets['routed'] ?? 0,
    dup: buckets['dup'] ?? 0,
  }
}
