import { get } from '../lib/http'
import { withProjectQuery } from '../hooks/useProject'
import type {
  ChainsListResponse,
  ChainStateResponse,
  ChainSummary,
  FindChainResponse,
} from '../lib/chainIndex'
import type { ChainRow, ChainDetail, TaskRow } from './types.gen'

function adaptChainRow(row: ChainRow): ChainSummary {
  return {
    id: row.id,
    slug: row.slug,
    status: row.status,
    tasks_total: row.total_tasks,
    tasks_pending: row.pending,
    tasks_active: row.active,
    tasks_blocked: row.blocked,
    tasks_closed: row.closed,
    tasks_cancelled: row.cancelled,
    updated_at: row.updated_at,
  }
}

export interface ListChainsOptions {
  signal?: AbortSignal
  project?: string
  includeClosed?: boolean
}

export async function listChains(opts: ListChainsOptions = {}): Promise<ChainsListResponse> {
  const params = new URLSearchParams()
  if (opts.includeClosed) params.set('include_closed', 'true')
  let path = params.size > 0 ? `/chains?${params}` : '/chains'
  path = withProjectQuery(path, opts.project)
  const rows = await get<ChainRow[]>(path, opts.signal)
  return { chains: rows.map(adaptChainRow) }
}

export interface GetChainStateOptions {
  signal?: AbortSignal
  project?: string
}

// design_decisions retired from this projection-side cache in
// migration 065 (Phase 4 F2). The EventTimeline reads the rationale
// from ChainCreated/ChainEdited event payloads.

export async function getChainState(
  slug: string,
  opts: GetChainStateOptions = {},
): Promise<ChainStateResponse> {
  let tasksPath = `/tasks?chain_slug=${encodeURIComponent(slug)}`
  tasksPath = withProjectQuery(tasksPath, opts.project)
  let detailPath = `/chains/${encodeURIComponent(slug)}`
  detailPath = withProjectQuery(detailPath, opts.project)
  // Fan out the two reads in parallel. The detail endpoint is allowed
  // to 404 for a chain that exists in the tasks table but was never
  // forged with prose — fall back to empty strings in that case.
  const [tasks, detail] = await Promise.all([
    get<TaskRow[]>(tasksPath, opts.signal),
    get<ChainDetail>(detailPath, opts.signal).catch(() => null),
  ])
  return {
    found: tasks.length > 0 || detail !== null,
    chain_slug: slug,
    chain_path: null,
    // Prefer the project_id the backend returned; fall back to the
    // caller-supplied project filter when the detail read 404'd. Null
    // only when neither is available — a tasks-only orphan with no
    // project hint.
    project_id: detail?.project_id ?? opts.project ?? null,
    tasks: tasks.map(t => ({
      id: t.id,
      order: t.position,
      slug: t.slug,
      status: t.status,
      problem_statement: t.problem_statement,
    })),
    output: detail?.output ?? '',
    completion_condition: detail?.completion_condition ?? '',
  }
}

/**
 * Client-side fuzzy filter over the full chain list. observe-http has
 * no `/chains/find` endpoint; we fetch all chains (including closed
 * for find context) and score by substring presence in the slug.
 */
export async function findChain(
  query: string,
  includeClosed = true,
  opts: { signal?: AbortSignal; project?: string } = {},
): Promise<FindChainResponse> {
  const list = await listChains({ ...opts, includeClosed })
  const q = query.toLowerCase().trim()
  if (q === '') {
    return { found: false, query, results: [] }
  }
  // Tokenize on whitespace so a multi-word query like "work port"
  // matches every slug that contains BOTH tokens (typical agent
  // intent), not just slugs that contain the literal " " separator.
  // Single-word queries fall back to the substring-match path. A leading
  // '#' (as the id chip renders it) is stripped so "#331" matches the
  // chain with id 331.
  const tokens = q.split(/\s+/).map(t => t.replace(/^#/, '')).filter(Boolean)
  const results = list.chains
    .filter(c => {
      const slugLower = c.slug.toLowerCase()
      const idStr = c.id != null ? String(c.id) : ''
      // A token matches on the slug OR the numeric id.
      return tokens.every(t => slugLower.includes(t) || (idStr !== '' && idStr.includes(t)))
    })
    .map(c => {
      const slugLower = c.slug.toLowerCase()
      // Earliest slug match across tokens drives score; a prefix match — or a
      // pure id match with no slug hit — boosts to 1.0 (id matches are precise).
      const slugIdxs = tokens.map(t => slugLower.indexOf(t)).filter(i => i >= 0)
      const idx = slugIdxs.length > 0 ? Math.min(...slugIdxs) : 0
      const score = idx === 0 ? 1.0 : 1.0 / (idx + 1)
      return {
        slug: c.slug,
        status: c.status,
        tasks_total: c.tasks_total,
        tasks_closed: c.tasks_closed,
        score,
      }
    })
    .sort((a, b) => b.score - a.score)
  return {
    found: results.length > 0,
    query,
    results,
  }
}
