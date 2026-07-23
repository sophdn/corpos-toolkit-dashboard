/** Types and utilities for the bug index page. Shares splitSurface and
 * matchesRecordSearch with the sibling suggestion index — see
 * lib/recordIndex.ts for the cross-page extraction.
 */

import {
  matchesRecordSearch,
  splitSurface,
  type RecordIndexRow,
} from './recordIndex'

// Re-exported for back-compat with callers that still import from this
// module; new code should import directly from recordIndex.
export { splitSurface }

/** Bug-side wrapper around the shared matchesRecordSearch — kept as a
 * named export so existing callsites (and tests) need no change. */
export function matchesBugSearch(bug: BugListRow, query: string): boolean {
  return matchesRecordSearch(bug, query)
}

/**
 * One row of the bug list. Extends the shared base shape (slug, title,
 * status, surface, filed_at, resolved_at, project_id) with bug-specific
 * vocabulary (`severity`).
 */
export interface BugListRow extends RecordIndexRow {
  severity: string
}

export interface BugListResponse {
  bugs: BugListRow[]
  count: number
}

/** Full bug detail returned by bug_read. */
export interface BugDetail {
  slug: string
  title: string
  problem_statement: string
  surface: string
  severity: string
  source: string
  acceptance_criteria: string
  constraints: string
  status: string
  // resolution_note retired in migration 065 (Phase 4 F2); surfaced
  // via the BugResolved event payload only.
  routed_chain_slug: string
  routed_task_slug: string
  filed_at: string
  resolved_at: string | null
  resolved_commit_sha: string | null
  resolved_dirty: boolean | null
  spawned_successor_slug: string | null
  recurrence_candidates: string | null
  resolution_kind: string | null
  /** Project this bug lives under in the unified DB. */
  project_id: string
}

/** Corpus-wide bug status breakdown from bug_resolution_mix.
 * `upstream` is the bug 1330 sibling of `wontfix` for bugs whose root
 * cause lives in a dependency we don't author. Keep both buckets so the
 * page can distinguish "declined to fix locally because external" from
 * "out of scope / working as intended".
 */
export interface BugResolutionMix {
  open: number
  fixed: number
  wontfix: number
  upstream: number
  routed: number
  dup: number
}
