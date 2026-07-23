// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Response from /chains/status. */
export interface ChainsListResponse {
  chains: ChainSummary[]
}

/** Single chain row returned by /chains/status (the chain list endpoint). */
export interface ChainSummary {
  /**
   * Numeric DB id — surfaced in the chain row alongside the slug. Optional to
   * tolerate older server responses (same back-compat stance as tasks_active);
   * real chain rows always carry it and the id chip renders only when present.
   */
  id?: number
  slug: string
  /** 'open' | 'closed' | 'retired' */
  status: string
  tasks_total: number
  tasks_pending: number
  /**
   * Tasks in 'active' status. Drives the in-progress-vs-pending
   * bucket: a chain is 'in-progress' iff it has at least one active
   * task. A chain whose only non-terminal tasks are pending or
   * blocked sorts as 'pending' — no in-flight work to display.
   * Optional in the type to tolerate older server responses; absent
   * is treated as 0.
   */
  tasks_active?: number
  /**
   * Tasks in 'blocked' status — waiting on a dependency edge. Treated
   * as a not-yet-started state for bucketing. Optional for the same
   * back-compat reason as `tasks_active`.
   */
  tasks_blocked?: number
  tasks_closed: number
  tasks_cancelled: number
  /** ISO-8601 timestamp of last task state change. */
  updated_at: string
}

/** Single result entry from /chains/find. */
export interface FindChainResult {
  slug: string
  status: string
  tasks_total: number
  tasks_closed: number
  score: number
}

/** Response from /chains/find?query=... */
export interface FindChainResponse {
  found: boolean
  query: string
  results: FindChainResult[]
  note?: string
}

/** Per-task row inside a ChainStateResponse (from /chains/state). */
export interface ChainTask {
  /**
   * Numeric DB id — surfaced in the task row alongside the slug. Optional for
   * the same back-compat reason as ChainSummary.id; real task rows always carry
   * it and the id cell renders only when present.
   */
  id?: number
  order: number
  slug: string
  status: string
  problem_statement: string
}

/** Response from /chains/state?chain_slug=X. */
export interface ChainStateResponse {
  found: boolean
  chain_slug: string
  chain_path: string | null
  /**
   * The project the chain belongs to. Null only when the backing
   * /chains/{slug} read 404s AND no `project` was passed to
   * getChainState — i.e. a tasks-only orphan. Components that need to
   * thread project to downstream features (EventTimeline, etc.) should
   * null-check or fall back.
   */
  project_id: string | null
  tasks: ChainTask[]
  output: string
  // design_decisions retired in migration 065 (Phase 4 F2); rationale
  // flows through the EventTimeline now.
  completion_condition: string
  shared_context?: string
  error?: string
}

// ---------------------------------------------------------------------------
// Task content search types + helpers
// ---------------------------------------------------------------------------

/** One match row from /tasks/search: one entry per (task × matching field). */
export interface TaskContentMatch {
  chain_slug: string
  chain_status: string
  task_slug: string
  task_status: string
  /** Which content field matched, e.g. "problem_statement". */
  field: string
  /** ~200-char window around the first occurrence of the search pattern. */
  snippet: string
}

/** Response from /tasks/search?pattern=... */
export interface TaskContentSearchResponse {
  count: number
  truncated: boolean
  pattern: string
  matches: TaskContentMatch[]
}

/** One segment of a highlighted snippet: plain text or the matched portion. */
export interface HighlightedSegment {
  text: string
  highlighted: boolean
}

/**
 * Split `snippet` into highlighted and plain segments by case-insensitive
 * match of `pattern`. Returns a single plain segment if pattern is blank or
 * not found.
 */
export function highlightSnippet(snippet: string, pattern: string): HighlightedSegment[] {
  if (!pattern.trim()) return [{ text: snippet, highlighted: false }]
  const lower = snippet.toLowerCase()
  const patLower = pattern.toLowerCase()
  const idx = lower.indexOf(patLower)
  if (idx === -1) return [{ text: snippet, highlighted: false }]
  const segments: HighlightedSegment[] = []
  if (idx > 0) segments.push({ text: snippet.slice(0, idx), highlighted: false })
  segments.push({ text: snippet.slice(idx, idx + pattern.length), highlighted: true })
  if (idx + pattern.length < snippet.length) {
    segments.push({ text: snippet.slice(idx + pattern.length), highlighted: false })
  }
  return segments
}

// ---------------------------------------------------------------------------
// Progress buckets (ported from vantage TaskIndex)
// ---------------------------------------------------------------------------

export type ChainProgressBucket = 'pending' | 'in-progress' | 'closed'
export type ChainStatusFilter = 'all' | 'pending' | 'in-progress' | 'closed'
export type ChainSortMode = 'updated-desc' | 'updated-asc' | 'slug-asc' | 'slug-desc'

/** Closed + cancelled — both represent finished work. */
export function chainFinishedCount(c: ChainSummary): number {
  return c.tasks_closed + c.tasks_cancelled
}

/**
 * Derive a progress bucket from chain status + task counts.
 *
 * - `closed`: chain status is terminal (closed/retired), OR every task is finished.
 * - `in-progress`: the chain has been moved on — at least one task is
 *   in 'active' status (work in flight) OR at least one task has
 *   reached a terminal state (closed/cancelled, work has happened).
 * - `pending`: no work has happened AND none is in flight. Includes
 *   the all-pending case AND the all-blocked case AND the mixed
 *   pending+blocked case — none of those represent any movement.
 *
 * The active-OR-finished rule distinguishes "parked on a condition"
 * (only pending+blocked → pending bucket) from "in motion" (any
 * closed/cancelled/active → in-progress bucket). Blocked alone is
 * never in-progress because waiting-on-a-dependency isn't movement;
 * it's a paused state. Closed alone IS in-progress because completed
 * work proves the chain has been worked on, even if the next task
 * hasn't been picked up yet.
 */
export function chainProgressBucket(c: ChainSummary): ChainProgressBucket {
  if (c.status === 'closed' || c.status === 'retired') return 'closed'
  const total = c.tasks_total
  const finished = chainFinishedCount(c)
  if (total === 0) return 'pending'
  if (finished >= total) return 'closed'
  // In-progress iff something has happened OR is happening. Absent
  // tasks_active (older server) is treated as 0; the finished count
  // alone is enough to prove movement.
  if (finished > 0 || (c.tasks_active ?? 0) > 0) return 'in-progress'
  return 'pending'
}

export function chainSortCompare(mode: ChainSortMode): (a: ChainSummary, b: ChainSummary) => number {
  switch (mode) {
    case 'updated-desc':
      return (a, b) => b.updated_at.localeCompare(a.updated_at)
    case 'updated-asc':
      return (a, b) => a.updated_at.localeCompare(b.updated_at)
    case 'slug-asc':
      return (a, b) => a.slug.localeCompare(b.slug)
    case 'slug-desc':
      return (a, b) => b.slug.localeCompare(a.slug)
  }
}

export function chainStatusPredicate(filter: ChainStatusFilter): ((c: ChainSummary) => boolean) | undefined {
  if (filter === 'all') return undefined
  return c => chainProgressBucket(c) === filter
}

// ---------------------------------------------------------------------------
// Task helpers
// ---------------------------------------------------------------------------

export function statusLabel(status: string): string {
  switch (status) {
    case 'pending':     return 'Pending'
    case 'active':      return 'Active'
    case 'in-progress': return 'In progress'
    case 'closed':      return 'Closed'
    case 'cancelled':   return 'Cancelled'
    case 'blocked':     return 'Blocked'
    default:            return status
  }
}

export function countByStatus(tasks: ChainTask[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const task of tasks) {
    counts[task.status] = (counts[task.status] ?? 0) + 1
  }
  return counts
}

// ---------------------------------------------------------------------------
// Visible chain pipeline (filter → sort → optional find-narrowing)
// ---------------------------------------------------------------------------

/**
 * Compute the chain list visible in the left panel.
 *
 * Steps (applied in order):
 *  1. Status filter via chainStatusPredicate
 *  2. Sort via chainSortCompare
 *  3. If findSlugs is not null, narrow to chains whose slug is in the set
 *
 * Passing `null` for findSlugs skips step 3 (no search active).
 * Passing an empty Set narrows to zero results.
 */
export function applyVisibleChains(
  chains: ChainSummary[],
  statusFilter: ChainStatusFilter,
  sortMode: ChainSortMode,
  findSlugs: Set<string> | null,
): ChainSummary[] {
  const predicate = chainStatusPredicate(statusFilter)
  const sortFn = chainSortCompare(sortMode)
  let list = predicate ? chains.filter(predicate) : [...chains]
  list = list.sort(sortFn)
  if (findSlugs !== null) {
    list = list.filter(c => findSlugs.has(c.slug))
  }
  return list
}

// ---------------------------------------------------------------------------
// Chain header stats (aggregate across all chains)
// ---------------------------------------------------------------------------

export interface ChainHeaderStats {
  total: number
  open: number
  closed: number
  tasksClosedTotal: number
  tasksTotalAll: number
}

/**
 * Compute aggregate stats for the chain summary header from the full chain list.
 *
 * "open" / "closed" use chainProgressBucket — a chain with status='open' but
 * all tasks finished (closed + cancelled) is counted as closed, matching the
 * list-view filter behaviour and fixing the inflated open count.
 * tasksClosedTotal / tasksTotalAll are summed across ALL chains regardless of chain status.
 */
export function computeChainHeaderStats(chains: ChainSummary[]): ChainHeaderStats {
  let open = 0
  let closed = 0
  let tasksClosedTotal = 0
  let tasksTotalAll = 0

  for (const c of chains) {
    if (chainProgressBucket(c) === 'closed') {
      closed++
    } else {
      open++
    }
    tasksClosedTotal += c.tasks_closed
    tasksTotalAll += c.tasks_total
  }

  return { total: chains.length, open, closed, tasksClosedTotal, tasksTotalAll }
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/** Format an ISO timestamp as YYYY-MM-DD. */
export function formatUpdatedAt(iso: string): string {
  return iso.slice(0, 10)
}
