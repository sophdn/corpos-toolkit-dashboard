import { get } from '../lib/http'
import { withProjectQuery } from '../hooks/useProject'

// Inference API client — chain telemetry-substrate-cleanup T3.
// Binds to /inference/health-cards, /inference/sparklines, and
// /inference/retrieval-health. The pre-T3 /inference/stats surface was
// retired in T3d.

/**
 * Per-signal warming-up flags. When `true`, the corresponding scalar on
 * the HealthCard is `null` because there isn't enough data in the
 * window to compute a meaningful value. The dashboard renders these as
 * visible "warming up" badges rather than silently degrading to a
 * misleading default (vault learning
 * 2026-05-12_telemetry-history-warmup-period).
 */
export interface WarmingUpFlags {
  p99: boolean
  success_rate: boolean
  sparklines: boolean
}

/** One model's per-task aggregate. Surfaced inside HealthCard. */
export interface ModelStat {
  model_name: string
  call_count: number
  p95_latency_ms: number
}

/**
 * One health card per discrete task_id. Stale tasks (longest-since-last-call)
 * sort first server-side, so the operator sees "what's broken" before
 * "what's working."
 */
export interface HealthCard {
  task_id: string
  last_call_at: string | null
  call_count: number
  p50_latency_ms: number | null
  p95_latency_ms: number | null
  p99_latency_ms: number | null
  success_rate: number | null
  success_rate_basis: string
  bug_count: number
  tokens_per_day: number | null
  model_breakdown: ModelStat[]
  warming_up: WarmingUpFlags
}

/** One day's bucket of activity for a task. */
export interface SparklineBucket {
  date: string
  call_count: number
  p95_latency_ms: number | null
  success_rate: number | null
  tokens_burned: number
}

/** Per-task time series of daily buckets. */
export interface Sparkline {
  task_id: string
  buckets: SparklineBucket[]
}

export interface InferenceOptions {
  signal?: AbortSignal
  project?: string
  window_days?: number
}

export async function getInferenceHealthCards(
  opts: InferenceOptions = {},
): Promise<HealthCard[]> {
  const params = new URLSearchParams()
  if (opts.window_days != null) params.set('window_days', String(opts.window_days))
  let path = params.size > 0 ? `/inference/health-cards?${params}` : '/inference/health-cards'
  path = withProjectQuery(path, opts.project)
  return get<HealthCard[]>(path, opts.signal)
}

export interface SparklinesOptions extends InferenceOptions {
  task_id?: string
}

export async function getInferenceSparklines(
  opts: SparklinesOptions = {},
): Promise<Sparkline[]> {
  const params = new URLSearchParams()
  if (opts.window_days != null) params.set('window_days', String(opts.window_days))
  if (opts.task_id) params.set('task_id', opts.task_id)
  let path = params.size > 0 ? `/inference/sparklines?${params}` : '/inference/sparklines'
  path = withProjectQuery(path, opts.project)
  return get<Sparkline[]>(path, opts.signal)
}

/**
 * Traffic-light tier for a task's last_call_at — drives the cell tinting on
 * the Inference table. Matches the stale-threshold constants on the Go
 * side (24h / 1h boundaries).
 */
export type StaleTier = 'green' | 'yellow' | 'red' | 'unknown'

// Retrieval-health panel types — chain telemetry-substrate-cleanup T3c.
// The panel reads /inference/retrieval-health to surface tiered
// click_kind stats per retrieval action (vault_search / kiwix_search /
// knowledge_search). Tiered per vault learning
// 2026-05-17_tiered-implicit-feedback-for-rag-telemetry: separate
// per-kind rates AND a weighted aggregate score, not a flat "any
// click" rate.

export interface RetrievalKindStat {
  click_kind: string
  count: number
  rate: number
  weight: number
}

export interface RetrievalHealthAction {
  action: string
  grounding_count: number
  interaction_count: number
  by_kind: RetrievalKindStat[]
  weighted_score: number
  warming_up: boolean
}

export async function getInferenceRetrievalHealth(
  opts: InferenceOptions = {},
): Promise<RetrievalHealthAction[]> {
  const params = new URLSearchParams()
  if (opts.window_days != null) params.set('window_days', String(opts.window_days))
  let path = params.size > 0 ? `/inference/retrieval-health?${params}` : '/inference/retrieval-health'
  path = withProjectQuery(path, opts.project)
  return get<RetrievalHealthAction[]>(path, opts.signal)
}

// Per-tool-per-model ranking — chain per-tool-per-model-observability T12.
// Reads /inference/tool-model-performance, backed by the read-side
// projection proj_inference_tool_model_performance. success_rate here is
// CALL-LEVEL (no-error AND non-empty output); outcome_success_rate is the
// OUTCOME layer (classify→benchmark, vault→grounding, else liveness floor),
// materialized by chain telemetry-success-model-unification (the both-layers
// model). avg_tokens is null when no usage was recorded for any call in the
// (tool, model) group.

export interface ToolModelStat {
  task_id: string
  model_name: string
  call_count: number
  success_rate: number
  outcome_success_rate: number
  avg_latency_ms: number
  max_latency_ms: number
  avg_tokens: number | null
  last_invoked_at: string
}

export async function getInferenceToolModelPerformance(
  opts: InferenceOptions = {},
): Promise<ToolModelStat[]> {
  const path = withProjectQuery('/inference/tool-model-performance', opts.project)
  return get<ToolModelStat[]>(path, opts.signal)
}

export function staleTierForLastCall(lastCallAt: string | null, nowMs: number = Date.now()): StaleTier {
  if (lastCallAt == null) return 'unknown'
  // Server returns "YYYY-MM-DD HH:MM:SS" (SQLite datetime format, UTC).
  // Append "Z" so the JS parser treats it as UTC.
  const ts = Date.parse(lastCallAt.replace(' ', 'T') + 'Z')
  if (Number.isNaN(ts)) return 'unknown'
  const ageSec = (nowMs - ts) / 1000
  if (ageSec < 3600) return 'green'
  if (ageSec < 86400) return 'yellow'
  return 'red'
}
