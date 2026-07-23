/** Types for the /knowledge/index-card endpoint response. */

export interface SourceTypeCount {
  source_type: string
  count: number
}

export interface TopPointer {
  id: number
  source_type: string
  source_ref: string
  question: string
  usage_count: number
}

export interface RecentPointer {
  id: number
  source_type: string
  source_ref: string
  question: string
  created_at: string
}

export interface GroundingSummary {
  total_search_calls: number
  used_count: number
  used_pct: number
  zero_result_gap_count: number
  pure_memory_sessions: number
}

export interface KnowledgeIndexCard {
  total_active_pointers: number
  by_source_type: SourceTypeCount[]
  pending_curation_candidates: number
  top_queried: TopPointer[]
  recently_added: RecentPointer[]
  grounding_summary: GroundingSummary
}
