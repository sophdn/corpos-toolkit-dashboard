/** Types and utilities for the suggestion index page. Mirrors the shape
 * of lib/bugIndex.ts; both pages share splitSurface + matchesRecordSearch
 * from lib/recordIndex.ts. Per chain `agent-suggestion-box`: native
 * vocabulary throughout — `priority` not `severity`,
 * `adopted/deferred/rejected` not `fixed/wontfix/etc.`
 */

import {
  matchesRecordSearch,
  splitSurface,
  type RecordIndexRow,
} from './recordIndex'

export { splitSurface }

/** Suggestion-side wrapper around the shared matchesRecordSearch. */
export function matchesSuggestionSearch(
  suggestion: SuggestionListRow,
  query: string,
): boolean {
  return matchesRecordSearch(suggestion, query)
}

/**
 * One row of the suggestion list. Extends the shared base shape with
 * suggestion-specific vocabulary (`priority` instead of `severity`) and
 * the bug↔suggestion routing field.
 */
export interface SuggestionListRow extends RecordIndexRow {
  priority: string
  routed_chain_slug: string
  routed_task_slug: string
  routed_bug_slug: string
  resolved_commit_sha: string | null
}

export interface SuggestionListResponse {
  suggestions: SuggestionListRow[]
  count: number
}

/** Full suggestion detail returned by suggestion_read. */
export interface SuggestionDetail {
  slug: string
  title: string
  problem_statement: string
  surface: string
  priority: string
  source: string
  acceptance_criteria: string
  constraints: string
  status: string
  // resolution_note retired in migration 065 (Phase 4 F2); surfaced
  // via the SuggestionResolved event payload only.
  resolution_kind: string | null
  routed_chain_slug: string
  routed_task_slug: string
  routed_bug_slug: string
  resolved_commit_sha: string | null
  filed_at: string
  resolved_at: string | null
  /** Project this suggestion lives under in the unified DB. */
  project_id: string
}

/**
 * Corpus-wide suggestion status breakdown. Four buckets matching the
 * suggestion resolution vocabulary — distinct from BugResolutionMix's
 * six buckets per chain `agent-suggestion-box` design.
 */
export interface SuggestionResolutionMix {
  open: number
  adopted: number
  deferred: number
  rejected: number
}
