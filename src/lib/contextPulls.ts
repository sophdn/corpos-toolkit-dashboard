/**
 * TS contract for reference-resolution-substrate-frontend (RF2-RF4).
 * Mirrors go/internal/observehttp/context_pulls.go JSON tags — field
 * names match the wire exactly so a careless adapter can't drift
 * silently (same posture as lib/telemetry.ts, cautionary tale bug 1386).
 *
 * FOUR-AXIS DISCIPLINE (load-bearing) — docs/REFERENCE_RESOLUTION_FRONTEND.md §2:
 *   - query_source on grounding_events: who initiated (we filter to
 *     reference_resolution by default; admit any via the override knob).
 *   - action on grounding_events: which corpus was hit (vault_search /
 *     kiwix_search / knowledge_search / resolve_references).
 *   - source_type on knowledge_pointers: candidate-side pointer kind.
 *   - shape on reference_resolution_emits: the detector's classification
 *     of THIS reference token (chain_slug / domain_term / path / ...).
 *
 * Filter param names match the column names. NO generic `source` / `kind`.
 */

/** Closed enum of confidence tiers — refresolve.types.ConfidenceTier. */
export const CONFIDENCE_TIERS = [
  'single_exact',
  'fuzzy_multi',
  'weak_domain',
  'no_hit',
] as const
export type ConfidenceTier = (typeof CONFIDENCE_TIERS)[number]

/** Closed enum of query_source values seen by the surface; the legend
 *  on the page reads `available_query_sources` from the response so a
 *  new value (e.g. a future `agent_subagent`) renders without redeploy.
 *  This constant covers what the substrate emits TODAY. */
export const CONTEXT_PULL_QUERY_SOURCES = [
  'agent_initiated',
  'proactive_hook',
  'dashboard_user',
  'reference_resolution',
  'harness_reminder_interception',
  'other',
] as const
export type ContextPullQuerySource = (typeof CONTEXT_PULL_QUERY_SOURCES)[number]

/** The shape categories the detector currently emits — see
 *  go/internal/refresolve/types.go ShapeCategory. Used as the default
 *  legend; the response also returns `available_shapes` so newly-added
 *  enum values appear without redeploy. */
export const CONTEXT_PULL_SHAPES = [
  'chain_slug',
  'task_slug',
  'bug_slug',
  'path',
  'skill_name',
  'project_name',
  'tool_name',
  'forge_schema',
  'library_entry',
  'domain_term',
  'external_technical',
  'friction_shape',
  'skill_trigger',
  'memory_entry',
  'vault_candidate',
  'kiwix_bridge',
  'discipline_skill',
] as const
export type ContextPullShape = (typeof CONTEXT_PULL_SHAPES)[number]

/** Closed enum for the timeseries segment axis (RF1 §3.5). */
export const CONTEXT_PULL_SEGMENTS = [
  'shape',
  'confidence_tier',
  'source_type',
] as const
export type ContextPullSegment = (typeof CONTEXT_PULL_SEGMENTS)[number]

/** The presentation_recommendation values the substrate emits — one
 *  per ConfidenceTier per refresolve/handler.go::formatResolved. */
export const PRESENTATION_RECOMMENDATIONS = [
  'use_directly',
  'ask_user_to_disambiguate',
  'mention_as_possibly_relevant',
  'acknowledge_no_hit_and_ask',
] as const
export type PresentationRecommendation =
  (typeof PRESENTATION_RECOMMENDATIONS)[number]

// --- list / row shapes -----------------------------------------------

/** First-candidate summary embedded in each row. source_type is the
 *  knowledge_pointers axis — null when the candidate's pointer row is
 *  retired or never indexed. */
export interface ContextPullPointer {
  source_ref: string
  source_type: string
  position: number
}

/** One row in the inspector list view. Compact compared to the drawer
 *  detail; the drawer fetches by id on row-click. */
export interface ContextPullRow {
  grounding_event_id: number
  ts: string
  project_id: string
  session_id: string
  prompt_id: string | null
  span_id: string | null
  parent_span_id: string | null
  action: string
  query_source: string
  query_text: string | null
  shape: string | null
  confidence_tier: string | null
  presentation_recommendation: string | null
  presented_as: string | null
  results_count: number
  first_candidate: ContextPullPointer | null
  click_kinds_fired: string[]
  /** T7 forward-compat: null until the ML classifier scores this row. */
  ml_confidence_score: number | null
}

/** Cursor-paginated list response. The available_* legends drive the
 *  filter-chip dropdowns; reading from data (rather than hardcoding the
 *  TS enums) means newly-added enum values appear without redeploy. */
export interface ContextPullListResponse {
  items: ContextPullRow[]
  next_cursor: number | null
  page_size: number
  available_query_sources: string[]
  available_shapes: string[]
  available_confidence_tiers: string[]
  available_source_types: string[]
}

// --- detail / drawer shape -------------------------------------------

export interface ContextPullGroundingEvent {
  id: number
  ts: string
  project_id: string
  session_id: string
  prompt_id: string | null
  span_id: string | null
  parent_span_id: string | null
  action: string
  query_source: string
  user_message_id: string | null
  results_count: number
}

/** The detection-context block. source_message_excerpt is the forward-
 *  fill caveat field — RF2 returns null pending transcript-reader
 *  follow-up (see bug
 *  `context-pulls-detail-missing-source-message-excerpt-and-candidate-detail`). */
export interface ContextPullDetection {
  token: string
  shape: string
  confidence: number
  detection_method: string
  start_pos: number
  end_pos: number
  source_message_excerpt: string | null
}

export interface ContextPullResolver {
  name: string
  retrieval_cost_ms: number
  err: string | null
}

/** One candidate in the resolver's result set. title / score /
 *  debug_notes / ml_confidence_score are forward-fill: RF2 stores only
 *  position + source_ref + source_type per grounding_events.source_refs;
 *  the others depend on follow-up substrate work. */
export interface ContextPullCandidate {
  position: number
  source_ref: string
  source_type: string | null
  title: string | null
  score: number | null
  debug_notes: string | null
  ml_confidence_score: number | null
}

export interface ContextPullOutcome {
  confidence_tier: string
  presentation_recommendation: string
  presented_as: string
}

export interface ContextPullInteraction {
  interaction_id: number
  source_ref: string
  candidate_position: number | null
  click_kind: string
  click_weight: number
  was_injected: number
  detected_at: string
}

export interface ContextPullLinkedResolution {
  resolution_id: string
  entity_kind: string
  entity_slug: string
  entity_project_id: string
  outcome_kind: string
}

export interface ContextPullDetail {
  grounding_event: ContextPullGroundingEvent
  detection: ContextPullDetection
  resolver: ContextPullResolver
  candidates: ContextPullCandidate[]
  outcome: ContextPullOutcome
  interactions: ContextPullInteraction[]
  linked_resolutions: ContextPullLinkedResolution[]
  trajectory_deep_link: string
}

// --- entity-scoped response -------------------------------------------

export interface ContextPullEntityRef {
  kind: string
  slug: string
  project_id: string
}

export interface ContextPullByEntityResponse {
  entity: ContextPullEntityRef
  matched_prompt_ids: string[]
  items: ContextPullRow[]
  next_cursor: number | null
  page_size: number
}

// --- stats ------------------------------------------------------------

export interface ContextPullStatsResponse {
  total_references: number
  by_shape: Record<string, number>
  by_confidence_tier: Record<string, number>
  by_source_type: Record<string, number>
  by_query_source: Record<string, number>
}

export interface ContextPullsTimeseriesBucket {
  day: string
  segments: Record<string, number>
}

export interface ContextPullsTimeseriesResponse {
  segment: ContextPullSegment
  buckets: ContextPullsTimeseriesBucket[]
}
