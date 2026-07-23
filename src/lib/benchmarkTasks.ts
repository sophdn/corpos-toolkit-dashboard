// Type definitions for the /benchmarks/tasks endpoint
// (chain `mcp-servers/benchmarks-page-per-task-redesign` T2 → T3).
//
// One card per discrete offload task. Replaces the per-shape and
// per-rubric card surfaces.
//
// Post-rust-retirement T8: TaskCard codegen'd from
// go/internal/observehttp/benchmarks.go via tygo and re-exported with
// narrowed verdict / task_shape unions for switch-exhaustiveness.

import type { TaskCard as GenTaskCard } from '../api/types.gen'
import type { TaskShape } from './benchmarkCards'

/** SmokeVerdict variant name from the prior Rust enum (Go side carries
 * it as `verdict string`). Closed-set on the TS side. */
export type SmokeVerdict =
  | 'ExtractNowWithQwenDispatch'
  | 'ExtractNowKeepClaudeClassification'
  | 'RejectedRubricTooSoftForQwen'
  | 'DeferredWithTrigger'

/** One per-task card on the grid. Generated TaskCard's `verdict`,
 * `verdict_note`, `retrigger_condition`, and `task_shape` are
 * narrowed here for switch-exhaustiveness. */
export type TaskCard = Omit<
  GenTaskCard,
  'verdict' | 'verdict_note' | 'retrigger_condition' | 'task_shape'
> & {
  task_shape: TaskShape
  verdict: SmokeVerdict | null
  verdict_note: string | null
  retrigger_condition: string | null
}

export type BenchmarkTasksResponse = TaskCard[]

/** Pretty-print a task_id for display (kebab-case → Title Case). */
export function formatTaskTitle(task_id: string): string {
  return task_id
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
