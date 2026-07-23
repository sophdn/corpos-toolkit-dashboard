// Type definitions for the /benchmarks/cards endpoint
// (chain `benchmarks-shape-criteria-reshape` T8 → T9).
//
// Per-shape × per-model aggregations of the criterion subscores.
// The dashboard renders one card per task_shape, with a radar
// overlay per model.
//
// Post-rust-retirement T8 (2026-05-22): ModelMetrics / ShapeCard are
// codegen'd from go/internal/observehttp/{benchmarks,benchmarks_aggregate}.go
// via tygo and re-exported from this module. TaskShape stays a TS
// literal-union (the Go side has it as a `string` — tygo can't infer
// the closed set). Drift is caught by the precommit gate.

import type {
  ModelMetrics as GenModelMetrics,
  ShapeCard as GenShapeCard,
} from '../api/types.gen'

/** Canonical task-shape strings. Closed-set TS-side; Go-side `string`
 * since the column is free-text and tygo can't infer a literal union. */
export type TaskShape = 'Extract' | 'Classify' | 'Retrieve' | 'Summarize'

/** Stable order for cards on the grid (alphabetical reads cleanly). */
export const ALL_TASK_SHAPES: TaskShape[] = [
  'Classify',
  'Extract',
  'Retrieve',
  'Summarize',
]

/** Per-(shape, model) aggregation. Re-exported from the codegen module
 * so legacy consumers keep working without an import-path churn. */
export type ModelMetrics = GenModelMetrics

/** One card on the grid. Re-exported from the codegen module.
 * task_shape is `string` on the Go side but the dashboard treats it as
 * the closed TaskShape union; we trust the runtime contract. */
export type ShapeCard = Omit<GenShapeCard, 'task_shape'> & {
  task_shape: TaskShape
}

/** Response from GET /benchmarks/cards. */
export type BenchmarkCardsResponse = ShapeCard[]

/** Axis spec — what each radar dimension is called and where to find the value. */
export interface RadarAxis {
  /** Display label, Title Case English. */
  label: string
  /** Field on ModelMetrics this axis reads. */
  field:
    | 'accuracy'
    | 'honesty'
    | 'ranking_quality'
    | 'within_budget'
    | 'latency_normalized'
    | 'tokens_normalized'
}

/** Per-shape axis sets per scope.md § 'Per-criterion axes per shape'. */
export const AXES_BY_SHAPE: Record<TaskShape, RadarAxis[]> = {
  Extract: [
    { label: 'Accuracy', field: 'accuracy' },
    { label: 'Honesty', field: 'honesty' },
    { label: 'Latency', field: 'latency_normalized' },
    { label: 'Tokens', field: 'tokens_normalized' },
  ],
  Classify: [
    { label: 'Accuracy', field: 'accuracy' },
    { label: 'Honesty', field: 'honesty' },
    { label: 'Latency', field: 'latency_normalized' },
    { label: 'Tokens', field: 'tokens_normalized' },
  ],
  Retrieve: [
    { label: 'Accuracy', field: 'accuracy' },
    { label: 'Honesty', field: 'honesty' },
    { label: 'Ranking Quality', field: 'ranking_quality' },
    { label: 'Latency', field: 'latency_normalized' },
    { label: 'Tokens', field: 'tokens_normalized' },
  ],
  Summarize: [
    { label: 'Accuracy', field: 'accuracy' },
    { label: 'Honesty', field: 'honesty' },
    { label: 'Within Budget', field: 'within_budget' },
    { label: 'Latency', field: 'latency_normalized' },
    { label: 'Tokens', field: 'tokens_normalized' },
  ],
}
