/**
 * TS contract for query-telemetry-substrate-frontend QF3-QF5 surfaces.
 * Mirrors go/internal/observehttp/telemetry.go struct tags — field
 * names match the JSON exactly so a careless adapter can't drift
 * silently (see bug 1386 for the cautionary tale: the audit-ledger
 * RelatedQuery TS type drifted from the Go shape and rendered empty
 * cells for weeks).
 *
 * THREE-AXIS DISCIPLINE (load-bearing): action / query_source /
 * source_type are three orthogonal axes per docs/TELEMETRY_FRONTEND.md
 * §2 and migration 037. No field collapses them into bare 'source' or
 * 'type'. Renderers MUST dispatch on the right axis:
 *   - per-candidate dispatch: source_type ∈ {vault, kiwix, library,
 *     task, chain, bug} — kind of returned knowledge_pointer
 *   - per-corpus label: action ∈ {vault_search, kiwix_search,
 *     knowledge_search} — which search call was made
 *   - per-initiator label: query_source ∈ {agent_initiated,
 *     proactive_hook, dashboard_user, other} — who triggered it
 */

/** One row in the original result set of a query. */
export interface TrajectoryResult {
  position: number
  source_ref: string
  /** Joined from knowledge_pointers; null when the pointer was retired
   *  since the search fired or never indexed. */
  source_type: string | null
  candidate_pointer_id: number | null
}

/** One row in query_interactions; per click_kind tier firing. */
export interface TrajectoryInteraction {
  interaction_id: number
  source_ref: string
  position: number | null
  click_kind: 'followed' | 'cited' | 'mentioned' | 'resolved-from'
  click_weight: number
  citation_kind: string | null
  dwell_ms_estimate: number | null
  was_injected: number
  detected_at: string
}

/** One row in query_resolutions whose grounding_event_ids contains
 *  this query_id. write_event_ids is the JSON array stored as-is —
 *  the client hydrates each event via getAuditEvent(event_id). */
export interface TrajectoryResolution {
  resolution_id: string
  entity_kind: string
  entity_slug: string
  entity_project_id: string
  outcome_kind: string
  write_event_ids: string[]
  detected_at: string
}

/** Metadata block at the top of a trajectory view. */
export interface TrajectoryQuery {
  query_id: number
  span_id: string
  prompt_id: string | null
  session_id: string
  parent_span_id: string | null
  project_id: string
  action: string
  query_source: string
  query_text: string | null
  results_count: number
  created_at: string
}

/** Full trajectory envelope returned by /telemetry/trajectories/{id}
 *  and as elements of /telemetry/trajectories?span_id wrapper. */
export interface TrajectoryResponse {
  query: TrajectoryQuery
  results: TrajectoryResult[]
  interactions: TrajectoryInteraction[]
  resolutions: TrajectoryResolution[]
}

/** /telemetry/trajectories?span_id wraps zero-to-many trajectories. */
export interface TrajectoryBySpanResponse {
  trajectories: TrajectoryResponse[]
}

/** The four canonical click_kind tiers in render order. The
 *  InteractionList surfaces all four — empty subsections render as
 *  "no <tier> signals" rather than being hidden, so the operator
 *  sees the substrate's decomposition explicitly. */
export const CLICK_KIND_TIERS = [
  'followed',
  'cited',
  'mentioned',
  'resolved-from',
] as const

export type ClickKindTier = (typeof CLICK_KIND_TIERS)[number]

/** The six canonical source_type values (knowledge_pointers.source_type).
 *  Per-result renderers dispatch on this — NOT on query_source or
 *  action. */
export const SOURCE_TYPES = [
  'vault',
  'kiwix',
  'library',
  'task',
  'chain',
  'bug',
] as const

export type SourceType = (typeof SOURCE_TYPES)[number]

/** The two segment axes the analytics charts slice on. Closed enum
 *  per migration 037 + TELEMETRY_FRONTEND §2. */
export const SEGMENT_AXES = ['action', 'query_source'] as const
export type SegmentAxis = (typeof SEGMENT_AXES)[number]

/** The 5-value label_kind enum (TT1.5 §5). */
export const LABEL_KINDS = [
  'positive',
  'weakly_positive',
  'negative',
  'hard_negative',
  'unlabeled',
] as const
export type LabelKind = (typeof LABEL_KINDS)[number]

/** The 4-value query_source enum from migration 037's CHECK. */
export const QUERY_SOURCES = [
  'agent_initiated',
  'proactive_hook',
  'dashboard_user',
  'other',
] as const
export type QuerySource = (typeof QUERY_SOURCES)[number]

/** One day's bucket on the volume chart. segments maps the segment
 *  axis's values (e.g. "vault_search" or "agent_initiated") to query
 *  count. Keys are NOT hardcoded — read from the data so a new
 *  action or query_source landing in the substrate appears as a new
 *  line on the chart with no UI change. */
export interface AnalyticsVolumeBucket {
  day: string
  segments: Record<string, number>
}

export interface AnalyticsVolumeResponse {
  segment: SegmentAxis
  buckets: AnalyticsVolumeBucket[]
  totals_by_segment: Record<string, number>
}

/** Server-computed success-rate cell. query_count is the denominator,
 *  success_count is the numerator, success_rate is the pre-divided
 *  ratio (single source of truth per TELEMETRY_FRONTEND §3.3). */
export interface AnalyticsSuccessCell {
  query_count: number
  success_count: number
  success_rate: number
}

export interface AnalyticsSuccessBucket {
  day: string
  segments: Record<string, AnalyticsSuccessCell>
}

export interface AnalyticsSuccessResponse {
  segment: SegmentAxis
  buckets: AnalyticsSuccessBucket[]
  totals_by_segment: Record<string, AnalyticsSuccessCell>
}

// --- training-pairs (QF5) --------------------------------------------

export interface TrainingPairItem {
  training_id: number
  grounding_event_id: number
  query_text: string | null
  candidate_pointer_id: number | null
  source_ref: string
  candidate_position: number
  label_kind: LabelKind
  weight: number
  /** JSON array of click_kind strings; rendered as chips so the
   *  spot-checker sees which tiers contributed to the label. */
  label_sources: string[]
  query_source: string
  was_injected: number
  prompt_id: string | null
  span_id: string | null
}

export interface TrainingPairsResponse {
  items: TrainingPairItem[]
  next_cursor: number | null
  page_size: number
}

/** Corpus-shape banner for the training-pair browser. All five
 *  label_kind buckets are always present (zero-filled) so the
 *  5-cell mini-bar renders consistent geometry across filter
 *  narrowings — see Go telemetry.go zeroFill helper. */
export interface TrainingPairsStatsResponse {
  total_pairs: number
  by_label_kind: Record<LabelKind, number>
  by_query_source: Record<string, number>
  by_action: Record<string, number>
}
