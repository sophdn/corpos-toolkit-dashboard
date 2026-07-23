// ── API response shapes ──────────────────────────────────────────────────────

/**
 * Per-scenario expected_arg entry. `kind` mirrors the Rust
 * `ExpectedArgValue` enum: `'exact'` carries the literal string the model
 * must produce; `'present'` only requires a non-null, non-empty value.
 */
export interface ExpectedArgEntry {
  name: string
  kind: 'exact' | 'present'
  value: string | null
}

/** L4 scenario as returned by GET /scenarios. */
export interface L4ScenarioEntry {
  layer: 'l4'
  id: string
  tool_name: string
  user_prompt: string
  expected_args: ExpectedArgEntry[]
}

/** L5 scenario as returned by GET /scenarios. */
export interface L5ScenarioEntry {
  layer: 'l5'
  id: string
  tool_name: string
  /** Synthetic JSON body presented to the model. */
  tool_output: string
  question: string
  /** Substring (case-insensitive) the model must produce in its answer. */
  expected_answer: string
}

/**
 * L6 expected decision. `kind === 'route_to'` carries the correct tool name;
 * `'no_tool'` and `'ask_for_clarification'` leave `route_to` null.
 */
export interface ExpectedDecision {
  kind: 'no_tool' | 'ask_for_clarification' | 'route_to'
  route_to: string | null
}

/** L6 scenario as returned by GET /scenarios. */
export interface L6ScenarioEntry {
  layer: 'l6'
  id: string
  tool_name: string
  user_prompt: string
  expected_decision: ExpectedDecision
}

/** Discriminated union of all scenario entry shapes. */
export type ScenarioEntry = L4ScenarioEntry | L5ScenarioEntry | L6ScenarioEntry

export interface ScenariosResponse {
  scenarios: ScenarioEntry[]
}

// ── Filter state ─────────────────────────────────────────────────────────────

/** The layer filter has an extra 'all' value vs the corpus-only layer set. */
export type CorpusLayer = 'l4' | 'l5' | 'l6'
export type LayerFilter = CorpusLayer | 'all'
export const CORPUS_LAYERS: readonly CorpusLayer[] = ['l4', 'l5', 'l6'] as const

// ── Pure logic ───────────────────────────────────────────────────────────────

/**
 * Apply layer + tool + free-text filters to the scenario list.
 *
 * - `layer === 'all'` keeps every entry; otherwise narrows to that layer.
 * - `tool === 'all'` keeps every tool; otherwise narrows to that tool name.
 * - `searchText` is matched case-insensitively against the entry's prompt /
 *   question / expected_answer / route_to / tool_output (whichever fields
 *   are present per layer). Empty search keeps every entry.
 *
 * Pure and easy to unit-test — the page wraps this around its useState values.
 */
export function filterScenarios(
  entries: ScenarioEntry[],
  layer: LayerFilter,
  tool: string,
  searchText: string,
): ScenarioEntry[] {
  const search = searchText.trim().toLowerCase()
  return entries.filter(entry => {
    if (layer !== 'all' && entry.layer !== layer) return false
    if (tool !== 'all' && entry.tool_name !== tool) return false
    if (search === '') return true
    return matchesSearch(entry, search)
  })
}

function matchesSearch(entry: ScenarioEntry, search: string): boolean {
  // Always-present.
  if (entry.id.toLowerCase().includes(search)) return true
  if (entry.tool_name.toLowerCase().includes(search)) return true
  // Layer-specific.
  switch (entry.layer) {
    case 'l4':
      if (entry.user_prompt.toLowerCase().includes(search)) return true
      return entry.expected_args.some(a =>
        a.name.toLowerCase().includes(search)
        || (a.value?.toLowerCase().includes(search) ?? false),
      )
    case 'l5':
      return (
        entry.question.toLowerCase().includes(search)
        || entry.expected_answer.toLowerCase().includes(search)
        || entry.tool_output.toLowerCase().includes(search)
      )
    case 'l6':
      if (entry.user_prompt.toLowerCase().includes(search)) return true
      return entry.expected_decision.route_to?.toLowerCase().includes(search) ?? false
  }
}

/**
 * Group entries by tool_name (then layer), preserving the input order
 * within each (tool, layer) group. Used for the per-tool grouped render
 * on the Scenarios page.
 */
export function groupByToolThenLayer(
  entries: ScenarioEntry[],
): { tool: string; byLayer: { layer: CorpusLayer; entries: ScenarioEntry[] }[] }[] {
  const byTool = new Map<string, ScenarioEntry[]>()
  for (const e of entries) {
    let arr = byTool.get(e.tool_name)
    if (!arr) { arr = []; byTool.set(e.tool_name, arr) }
    arr.push(e)
  }
  const tools = [...byTool.keys()].sort()
  return tools.map(tool => {
    const all = byTool.get(tool) ?? []
    const byLayer: { layer: CorpusLayer; entries: ScenarioEntry[] }[] = []
    for (const layer of CORPUS_LAYERS) {
      const layerEntries = all.filter(e => e.layer === layer)
      if (layerEntries.length > 0) byLayer.push({ layer, entries: layerEntries })
    }
    return { tool, byLayer }
  })
}
