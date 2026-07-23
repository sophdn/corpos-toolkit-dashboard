/**
 * Types and pure helpers for the Assays page — behavioral study runs of
 * the corpos lab. Mirrors the record-index shape (list + detail + live
 * refetch) of lib/bugIndex.ts, but the vocabulary is study-run native
 * (run provenance + a condition × run score grid) rather than bug/
 * suggestion.
 *
 * The wire interfaces below are HAND-WRITTEN rather than pulled from
 * src/api/types.gen.ts because the Go study_runs observe structs aren't
 * generatable in this workspace yet.
 * TODO: regen from Go once study_runs observe structs land, then drop
 * these hand-written wire shapes in favour of the types.gen.ts mirror.
 */

// ── Wire shapes (bare-array list rows + single detail object) ────────────────

/** One row of `GET /study-runs` (bare JSON array). */
export interface AssayRunWire {
  run_id: string
  name: string
  assay: string
  item_id: string
  image_ref: string
  image_digest: string
  model_id: string
  model_version: string
  status: string
  error: string
  run_at: string
}

/** One score cell from a run detail's `scores` array. */
export interface AssayScoreWire {
  condition: string
  run: number
  verdict_kind: string
  verdict_reason: string
  item: string
  rationale: string
}

/** `GET /study-runs/{run_id}` — the summary fields plus provenance +
 * scores. */
export interface AssayRunDetailWire extends AssayRunWire {
  study_digest: string
  materials_hashes: Record<string, string>
  responses_dir: string
  scores: AssayScoreWire[]
}

// ── View shapes ──────────────────────────────────────────────────────────────

/** One row of the assay run list. Native study-run vocabulary. */
export interface AssayRunRow {
  run_id: string
  name: string
  assay: string
  item_id: string
  image_ref: string
  image_digest: string
  model_id: string
  model_version: string
  status: string
  error: string
  run_at: string
}

/** One score cell in a run's condition × run grid. */
export interface AssayScore {
  condition: string
  run: number
  verdict_kind: string
  verdict_reason: string
  item: string
  rationale: string
}

/** Full run detail: provenance + the per-condition score list. */
export interface AssayRunDetail extends AssayRunRow {
  study_digest: string
  materials_hashes: Record<string, string>
  responses_dir: string
  scores: AssayScore[]
}

// ── Semantic status mapping ──────────────────────────────────────────────────

/** The three semantic status buckets the theme tokens model. */
export type SemanticStatus = 'positive' | 'neutral' | 'negative'

/**
 * Map a run `status` to a semantic status token bucket.
 * completed → positive, failed → negative, anything else → neutral.
 */
export function runStatusToSemantic(status: string): SemanticStatus {
  switch (status) {
    case 'completed':
      return 'positive'
    case 'failed':
      return 'negative'
    default:
      return 'neutral'
  }
}

/**
 * Map a `verdict_kind` to a semantic status token bucket.
 * pass / pass_with_condition → positive; fail → negative; everything
 * else (flag, deferred, not_applicable) → neutral.
 */
export function verdictToSemantic(verdictKind: string): SemanticStatus {
  switch (verdictKind) {
    case 'pass':
    case 'pass_with_condition':
      return 'positive'
    case 'fail':
      return 'negative'
    default:
      return 'neutral'
  }
}

/** Short, grid-friendly label for a verdict_kind. */
export function abbreviateVerdict(verdictKind: string): string {
  switch (verdictKind) {
    case 'pass':
      return 'PASS'
    case 'pass_with_condition':
      return 'PASS+'
    case 'flag':
      return 'FLAG'
    case 'deferred':
      return 'DEFER'
    case 'fail':
      return 'FAIL'
    case 'not_applicable':
      return 'N/A'
    default:
      return verdictKind ? verdictKind.slice(0, 5).toUpperCase() : '—'
  }
}

// ── Score grid pivot ─────────────────────────────────────────────────────────

/** One grid row: a condition and its cells aligned to `AssayScoreGrid.runs`. */
export interface AssayScoreGridRow {
  condition: string
  /** One entry per run in `AssayScoreGrid.runs`; null when that
   * (condition, run) pair has no score. */
  cells: (AssayScore | null)[]
}

/** Pivoted score grid: conditions (rows) × run indices (columns). */
export interface AssayScoreGrid {
  /** Conditions in first-seen order. */
  conditions: string[]
  /** Distinct run indices, ascending. */
  runs: number[]
  rows: AssayScoreGridRow[]
}

/**
 * Pivot a flat score list into a condition × run grid. Rows are the
 * conditions in first-seen order; columns are the distinct run indices
 * in ascending order. Missing (condition, run) pairs become null cells.
 */
export function pivotScores(scores: AssayScore[]): AssayScoreGrid {
  const conditions: string[] = []
  const runsSet = new Set<number>()
  // condition -> run -> score
  const lookup = new Map<string, Map<number, AssayScore>>()

  for (const score of scores) {
    if (!lookup.has(score.condition)) {
      lookup.set(score.condition, new Map())
      conditions.push(score.condition)
    }
    lookup.get(score.condition)!.set(score.run, score)
    runsSet.add(score.run)
  }

  const runs = [...runsSet].sort((a, b) => a - b)
  const rows: AssayScoreGridRow[] = conditions.map(condition => {
    const byRun = lookup.get(condition)!
    return {
      condition,
      cells: runs.map(run => byRun.get(run) ?? null),
    }
  })

  return { conditions, runs, rows }
}

// ── Search ───────────────────────────────────────────────────────────────────

/**
 * Return true when a run matches a free-text query against its run_id,
 * name, assay, item_id, or model_id. Case-insensitive substring match;
 * empty query matches everything.
 */
export function matchesAssaySearch(row: AssayRunRow, query: string): boolean {
  const q = query.toLowerCase().trim()
  if (!q) return true
  return (
    row.run_id.toLowerCase().includes(q) ||
    row.name.toLowerCase().includes(q) ||
    row.assay.toLowerCase().includes(q) ||
    row.item_id.toLowerCase().includes(q) ||
    row.model_id.toLowerCase().includes(q)
  )
}
