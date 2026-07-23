/**
 * Type definitions for the substrate audit-event ledger. Distinct from
 * lib/events.ts which describes the SSE bus (ToolkitEvent). See
 * docs/SUBSTRATE_FRONTEND.md §11 for the naming-collision rationale.
 *
 * Mirrors go/internal/observehttp/events.go's response shapes; field
 * names match the JSON exactly so a careless adapter layer can't drift
 * silently.
 */

export interface AuditActor {
  kind: 'agent' | 'human' | 'system'
  id: string
}

export interface AuditEntity {
  kind: string
  slug: string
  project_id: string | null
}

export interface AuditEntityRef {
  kind: string
  slug: string
  project_id: string | null
}

export interface AuditEvent {
  event_id: string
  ts: string
  actor: AuditActor
  type: string
  entity: AuditEntity
  /** Type-specific JSON payload. Per-type renderers cast to a typed shape. */
  payload: unknown
  rationale: string | null
  caused_by_event_id: string | null
  related_entities: AuditEntityRef[]
  span_id: string
  schema_version: number
}

/**
 * One row from query_resolutions joined back to this event via the
 * write_event_ids JSON array. Shape mirrors go/internal/observehttp/events.go's
 * `relatedQuery` struct — `resolution_id` + `entity_kind` + `entity_slug` +
 * `outcome_kind` + `prompt_id`. The earlier `{interaction_id, query,
 * source_type}` sketch from SUBSTRATE_FRONTEND.md §6.3 was vestigial; the
 * Go implementation pivoted to the resolution-row shape and this type is
 * the live contract.
 */
export interface RelatedQuery {
  resolution_id: string
  entity_kind: string
  entity_slug: string
  outcome_kind: string
  prompt_id: string
}

export interface AuditEventDetail extends AuditEvent {
  /**
   * Cross-substrate join to query-telemetry-substrate's query_resolutions.
   * `null` (not `[]`) means the sibling table doesn't exist yet — the UI
   * distinguishes "no data" from "no related queries". See
   * docs/SUBSTRATE_FRONTEND.md §6.
   */
  related_queries: RelatedQuery[] | null
}

export interface AuditEventListResponse {
  items: AuditEvent[]
  next_cursor: string | null
  page_size: number
}

/** Entity kinds the per-entity timeline endpoint accepts. */
export type AuditEntityKind = 'bug' | 'suggestion' | 'task' | 'chain' | 'benchmark_run'

/** Filter shape for /events/list — keys match the query params. */
export interface AuditEventListFilters {
  entity_kind?: string
  entity_slug?: string
  type?: string | string[]
  project?: string
  span_id?: string
  actor_kind?: string
  actor_id?: string
  since?: string
  until?: string
  q?: string
  cursor?: string
  limit?: number
}
