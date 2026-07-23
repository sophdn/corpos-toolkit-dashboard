/**
 * SSE event contract from the Go toolkit-server's `/events` stream
 * (`go/internal/observehttp/` mounts `go/internal/eventbus/`'s
 * Bus.Handler under the same router as the observe REST endpoints).
 * Each event carries a tagged variant via the `event` field;
 * consumers subscribe to specific event kinds via [`useEventBus`]
 * and re-fetch the relevant data.
 */
export type ToolkitEvent =
  | {
      event: 'task_completed'
      project_id: string
      chain_slug: string | null
      task_slug: string
    }
  | {
      event: 'task_transitioned'
      project_id: string
      task_slug: string
      to_status: string
    }
  | { event: 'bug_filed'; project_id: string; slug: string; severity: string }
  | { event: 'bug_resolved'; project_id: string; slug: string; kind: string }
  | {
      event: 'suggestion_filed'
      project_id: string
      slug: string
      priority: string
    }
  | {
      event: 'suggestion_resolved'
      project_id: string
      slug: string
      kind: string
    }
  | {
      event: 'benchmark_recorded'
      project_id: string
      tool_name: string
      model_name: string
      invocation_ok: boolean
    }
  | { event: 'knowledge_index_updated'; project_id: string; pointer_id: number }
  | { event: 'assay_recorded'; project_id: string; run_id: string }
  // Generic artifact-created fallback the backend may emit for a study
  // run (kind/schema = "study-run") instead of the specific
  // `assay_recorded` tag. The Assays page refetches on either.
  | { event: 'artifact_created'; project_id: string; kind: string; slug: string }

export type ToolkitEventKind = ToolkitEvent['event']

export const ALL_EVENT_KINDS: ToolkitEventKind[] = [
  'task_completed',
  'task_transitioned',
  'bug_filed',
  'bug_resolved',
  'suggestion_filed',
  'suggestion_resolved',
  'benchmark_recorded',
  'knowledge_index_updated',
  'assay_recorded',
  'artifact_created',
]
