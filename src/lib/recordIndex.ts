/**
 * Shared utilities for record-index pages (BugIndex, SuggestionIndex,
 * and any future entity that ships the same card-list + detail-pane
 * shape). Per chain `agent-suggestion-box` T+10 (dashboard parity):
 * the two indices share visual structure but differ in vocabulary
 * (bug.severity vs suggestion.priority; status enums; resolution-mix
 * shape). Anything truly shared lives here; per-record vocabulary stays
 * in lib/bugIndex.ts and lib/suggestionIndex.ts.
 */

/**
 * Minimum shape every record-index row implements. Pages may extend with
 * their own fields (severity for bugs, priority for suggestions); shared
 * components like RecordCard read only these base columns.
 */
export interface RecordIndexRow {
  /**
   * Numeric DB id — surfaced in the card so the id is visible alongside the
   * slug. Optional because RecordCard is also reused for id-less rows (e.g. the
   * Assays study-run list, keyed by a string run_id); the id chip renders only
   * when present. Real bug/suggestion rows always carry it.
   */
  id?: number
  slug: string
  title: string
  status: string
  surface: string
  filed_at: string
  resolved_at: string | null
  project_id: string
}

/**
 * Split a comma-separated tag string into a trimmed, non-empty token array.
 * `"seed-mcp,library,references"` → `["seed-mcp", "library", "references"]`.
 * Both bugs (surface) and suggestions (surface + tags) emit comma-kebab
 * strings via the same convention; this util is the single split point.
 */
export function splitSurface(value: string): string[] {
  return value.split(',').map(t => t.trim()).filter(Boolean)
}

/**
 * Return true when a record matches a free-text query against slug,
 * title, surface, or numeric id. Case-insensitive substring match; empty
 * query matches everything. Shared across BugIndex and SuggestionIndex —
 * both pages search the same fields client-side. A leading '#' (as the id
 * chip renders it) is stripped for the id match, so "#1156" and "1156"
 * both find the row with id 1156.
 */
export function matchesRecordSearch(row: RecordIndexRow, query: string): boolean {
  const q = query.toLowerCase().trim()
  if (!q) return true
  const idQ = q.replace(/^#/, '')
  return (
    row.slug.toLowerCase().includes(q) ||
    row.title.toLowerCase().includes(q) ||
    row.surface.toLowerCase().includes(q) ||
    (row.id != null && idQ !== '' && String(row.id).includes(idQ))
  )
}
