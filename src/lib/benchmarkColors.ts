// Deterministic per-model color palette so the same model is the
// same color across cards and across sessions. Per chain
// `benchmarks-shape-criteria-reshape` scope.md § 'Multi-model overlay'.

const PATTERNS: Array<{ matcher: RegExp; color: string }> = [
  { matcher: /^claude/i, color: '#3b5bdb' }, // royal blue
  { matcher: /^qwen/i, color: '#dc2626' }, // crimson
  { matcher: /^granite/i, color: '#15803d' }, // forest green
  { matcher: /^phi/i, color: '#7c3aed' }, // violet
  { matcher: /^watt/i, color: '#d97706' }, // amber
]

/** 12-color fallback palette for unmatched model names. */
const FALLBACK_PALETTE = [
  '#0ea5e9', // sky
  '#ec4899', // pink
  '#84cc16', // lime
  '#f59e0b', // orange
  '#06b6d4', // cyan
  '#a855f7', // purple
  '#ef4444', // red
  '#22c55e', // green
  '#eab308', // yellow
  '#6366f1', // indigo
  '#14b8a6', // teal
  '#f43f5e', // rose
]

function hash(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

/**
 * Pick a stable color for a model name. Pattern-matched first; otherwise
 * hash-derived from the 12-color fallback palette.
 */
export function colorForModel(modelName: string): string {
  for (const { matcher, color } of PATTERNS) {
    if (matcher.test(modelName)) {
      return color
    }
  }
  return FALLBACK_PALETTE[hash(modelName) % FALLBACK_PALETTE.length]
}
