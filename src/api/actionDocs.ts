import { get } from '../lib/http'

/**
 * Shape of GET /admin/action-docs from go/internal/observehttp/actiondocs.go.
 *
 * Field names mirror the TOML chunks under
 * go/internal/actiondocs/corpus/<surface>/<action>.toml (go:embed'd into
 * the binary) — one schema across disk, in-process registry, and wire.
 * See docs/ACTION_DOCS_FRONTEND.md §3.2 and corpus/_schema.toml.
 */
export interface ActionDocParam {
  name: string
  type: string
  required: boolean
  description: string
  default?: string
}

export interface ActionDocParamAlias {
  from: string
  to: string
  notes?: string
}

export interface ActionDocValueAlias {
  param: string
  from: string
  to: string
  notes?: string
}

export interface ActionDocErrorCondition {
  condition: string
  message: string
}

export interface ActionDocExample {
  description: string
  call: string
}

export interface ActionDocEnvelopeRequirement {
  field: string
  required: boolean
  reason?: string
  applies_to_actor_kinds?: string[]
}

export interface ActionDocReturns {
  shape?: string
  description?: string
}

export interface ActionDoc {
  surface: string
  action: string
  purpose: string
  params?: ActionDocParam[]
  param_aliases?: ActionDocParamAlias[]
  value_aliases?: ActionDocValueAlias[]
  errors?: ActionDocErrorCondition[]
  examples?: ActionDocExample[]
  notes?: string
  envelope_requirements?: ActionDocEnvelopeRequirement[]
  returns?: ActionDocReturns
}

export interface ActionDocsParseError {
  source_file: string
  err: string
}

export interface ActionDocsResponse {
  count: number
  surfaces: string[]
  actions: Record<string, Record<string, ActionDoc>>
  /** Map of "surface.action" → true for actions classified as write
   * (presence in action-manifests/dispatch-policy.toml with
   * requires_rationale=true). Absence ⇒ read action. Empty when the
   * policy file is unloaded; UI degrades to "kind: unknown". */
  write_actions: Record<string, true>
  corpus_path: string
  parse_errors: ActionDocsParseError[]
}

/**
 * GET /admin/action-docs — returns the parsed per-action documentation
 * corpus. ?reload=1 forces a fresh disk read for that response (the
 * default serves the startup-loaded registry).
 *
 * The query-param filters (?surface, ?surface+?action) are convenience
 * for external scripts; the dashboard fetches the full corpus once on
 * mount and filters client-side.
 */
export async function getActionDocs(
  signal?: AbortSignal,
  opts?: { reload?: boolean },
): Promise<ActionDocsResponse> {
  const path = opts?.reload === true ? '/admin/action-docs?reload=1' : '/admin/action-docs'
  return get<ActionDocsResponse>(path, signal)
}

/** Stable URL format for cross-linking into the action-docs detail
 * view. /admin/dispatch-policy uses this to construct inbound "docs"
 * links per row; the format is pinned in docs/ACTION_DOCS_FRONTEND.md §4.2. */
export function actionDocsDetailPath(surface: string, action: string): string {
  return `/docs/actions/${surface}/${action}`
}

/** Stable anchor format used on /admin/dispatch-policy rows. The
 * detail view's "see dispatch policy" chip targets this anchor;
 * pinned in docs/ACTION_DOCS_FRONTEND.md §7.2. */
export function dispatchPolicyAnchor(surface: string, action: string): string {
  return `${surface}.${action}`
}
