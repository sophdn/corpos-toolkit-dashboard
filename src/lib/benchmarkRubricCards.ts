// Type definitions for the /benchmarks/rubric-cards endpoint
// (chain `mcp-servers/extract-now-rubric-foundation` T7 → T8).
//
// Per-rubric × per-model aggregations of the criterion subscores.
// The dashboard renders one card per registered A1 rubric (9 total),
// with the per-rubric verdict + retrigger condition surfaced for
// non-deployable rubrics.
//
// Post-rust-retirement T8: RubricCard is codegen'd from
// go/internal/observehttp/benchmarks.go via tygo and re-exported here.
// SmokeVerdict stays a TS literal-union — the Go side has `verdict` as
// `string` and tygo can't infer the closed set. Drift caught by precommit.

import type { RubricCard as GenRubricCard } from '../api/types.gen'

/** Smoke verdict variants — historically the Debug-formatted Rust enum.
 * Closed-set on the TS side for switch-exhaustiveness; Go-side is `string`. */
export type SmokeVerdict =
  | 'ExtractNowWithQwenDispatch'
  | 'ExtractNowKeepClaudeClassification'
  | 'RejectedRubricTooSoftForQwen'
  | 'DeferredWithTrigger'
  | 'Unknown'

/** One per-rubric card on the grid. Re-exported from the codegen
 * module with the verdict field narrowed to the SmokeVerdict union. */
export type RubricCard = Omit<GenRubricCard, 'verdict' | 'retrigger_condition'> & {
  verdict: SmokeVerdict
  retrigger_condition: string | null
}

export type BenchmarkRubricCardsResponse = RubricCard[]
