import type { AuditEntityRef } from '../../../lib/auditEvents'
import styles from './EventTimeline.module.css'

/**
 * Per-event-type payload renderers for the EventTimeline. Each function
 * is pure with respect to the payload — no fetches, no DOM side
 * effects. Unknown types fall through to renderGenericPayload (raw
 * JSON pretty-print).
 *
 * See docs/SUBSTRATE_FRONTEND.md §7 for the design of each shape.
 */

export interface RendererContext {
  refs: { caused_by_event_id: string | null; related_entities: AuditEntityRef[] }
}

export type EventRenderer = (
  payload: unknown,
  context: RendererContext,
) => React.ReactNode

// --- helpers --------------------------------------------------------

function PayloadRow({
  label,
  value,
  prose,
}: {
  label: string
  value: React.ReactNode
  /**
   * Switch to block layout: label as a small uppercase header, value
   * full-width below. Use for long-form prose fields (Summary, AuditDoc,
   * Problem, Output, Completion, Closure summary) — the default inline
   * 100px-label-column layout squishes them unreadably in the drawer.
   * Short metadata fields (Severity, Commit, Routed chain) stay inline.
   */
  prose?: boolean
}) {
  const rowClass = prose ? `${styles.payloadRow} ${styles.prose}` : styles.payloadRow
  return (
    <div className={rowClass}>
      <span className={styles.payloadLabel}>{label}</span>
      <span className={styles.payloadValue}>{value}</span>
    </div>
  )
}

/** Pretty-print the payload as JSON. Used by the fallback renderer and
 *  by per-type renderers that want to surface "unknown extra fields"
 *  alongside their typed display.
 */
function renderGenericPayload(payload: unknown): React.ReactNode {
  return (
    <pre className={styles.payloadFallback}>
      {JSON.stringify(payload, null, 2)}
    </pre>
  )
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function strOrUndefined(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}

function truncate(s: string, max = 80): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1) + '…'
}

// --- bug renderers --------------------------------------------------

const bugReported: EventRenderer = (payload) => {
  if (!isRecord(payload)) return renderGenericPayload(payload)
  return (
    <div className={styles.payload}>
      {strOrUndefined(payload['title']) && (
        <PayloadRow label="Title" value={String(payload['title'])} />
      )}
      {strOrUndefined(payload['severity']) && (
        <PayloadRow label="Severity" value={String(payload['severity'])} />
      )}
      {strOrUndefined(payload['surface']) && (
        <PayloadRow label="Surface" value={String(payload['surface'])} />
      )}
      {strOrUndefined(payload['source']) && (
        <PayloadRow label="Source" value={String(payload['source'])} />
      )}
      {strOrUndefined(payload['problem_statement']) && (
        <PayloadRow
          label="Problem"
          value={truncate(String(payload['problem_statement']), 200)}
          prose
        />
      )}
    </div>
  )
}

const bugResolved: EventRenderer = (payload) => {
  if (!isRecord(payload)) return renderGenericPayload(payload)
  const kind = String(payload['kind'] ?? '')
  return (
    <div className={styles.payload}>
      <PayloadRow label="Resolution" value={kind} />
      {kind === 'fixed' && strOrUndefined(payload['commit_sha']) && (
        <PayloadRow label="Commit" value={truncate(String(payload['commit_sha']), 12)} />
      )}
      {kind === 'dup' && strOrUndefined(payload['dup_of']) && (
        <PayloadRow label="Duplicate of" value={String(payload['dup_of'])} />
      )}
      {kind === 'routed' && strOrUndefined(payload['routed_chain_slug']) && (
        <PayloadRow label="Routed chain" value={String(payload['routed_chain_slug'])} />
      )}
      {kind === 'routed' && strOrUndefined(payload['routed_task_slug']) && (
        <PayloadRow label="Routed task" value={String(payload['routed_task_slug'])} />
      )}
    </div>
  )
}

const bugReopened: EventRenderer = (payload) => {
  if (!isRecord(payload)) return renderGenericPayload(payload)
  const prev = payload['previous_resolution']
  if (!isRecord(prev)) return renderGenericPayload(payload)
  return (
    <div className={styles.payload}>
      {strOrUndefined(prev['kind']) && (
        <PayloadRow label="Reversed kind" value={String(prev['kind'])} />
      )}
      {strOrUndefined(prev['commit_sha']) && (
        <PayloadRow
          label="Reversed commit"
          value={truncate(String(prev['commit_sha']), 12)}
        />
      )}
    </div>
  )
}

const bugStamped: EventRenderer = (payload) => {
  if (!isRecord(payload)) return renderGenericPayload(payload)
  const sha = strOrUndefined(payload['commit_sha'])
  if (sha === undefined) return renderGenericPayload(payload)
  return (
    <div className={styles.payload}>
      <PayloadRow label="Commit" value={truncate(sha, 12)} />
    </div>
  )
}

const updatedFieldsList: EventRenderer = (payload) => {
  if (!isRecord(payload)) return renderGenericPayload(payload)
  const fields = payload['updated_fields']
  if (!Array.isArray(fields)) return renderGenericPayload(payload)
  return (
    <div className={styles.payload}>
      <PayloadRow
        label="Updated fields"
        value={fields.map(String).join(', ')}
      />
    </div>
  )
}

// --- task renderers -------------------------------------------------

const taskCreated: EventRenderer = (payload) => {
  if (!isRecord(payload)) return renderGenericPayload(payload)
  return (
    <div className={styles.payload}>
      {strOrUndefined(payload['chain_slug']) && (
        <PayloadRow label="Chain" value={String(payload['chain_slug'])} />
      )}
      {typeof payload['position'] === 'number' && (
        <PayloadRow label="Position" value={String(payload['position'])} />
      )}
      {strOrUndefined(payload['problem_statement']) && (
        <PayloadRow
          label="Problem"
          value={truncate(String(payload['problem_statement']), 200)}
          prose
        />
      )}
    </div>
  )
}

const taskCompleted: EventRenderer = (payload) => {
  if (!isRecord(payload)) return renderGenericPayload(payload)
  return (
    <div className={styles.payload}>
      {strOrUndefined(payload['commit_sha']) && (
        <PayloadRow
          label="Commit"
          value={truncate(String(payload['commit_sha']), 12)}
        />
      )}
      {strOrUndefined(payload['closure_summary']) && (
        <PayloadRow
          label="Summary"
          value={truncate(String(payload['closure_summary']), 300)}
          prose
        />
      )}
    </div>
  )
}

const taskCancelled: EventRenderer = (payload) => {
  if (!isRecord(payload)) return renderGenericPayload(payload)
  const reason = strOrUndefined(payload['reason'])
  if (reason === undefined) return renderGenericPayload(payload)
  return (
    <div className={styles.payload}>
      <PayloadRow label="Reason" value={reason} />
    </div>
  )
}

const taskTransitioned: EventRenderer = (payload) => {
  if (!isRecord(payload)) return renderGenericPayload(payload)
  return (
    <div className={styles.payload}>
      {strOrUndefined(payload['from_status']) && strOrUndefined(payload['to_status']) && (
        <PayloadRow
          label="Status"
          value={`${String(payload['from_status'])} → ${String(payload['to_status'])}`}
        />
      )}
      {strOrUndefined(payload['blocker_slug']) && (
        <PayloadRow label="Blocker" value={String(payload['blocker_slug'])} />
      )}
    </div>
  )
}

// --- chain renderers ------------------------------------------------

const chainCreated: EventRenderer = (payload) => {
  if (!isRecord(payload)) return renderGenericPayload(payload)
  const tasks = payload['tasks']
  const taskCount = Array.isArray(tasks) ? tasks.length : undefined
  return (
    <div className={styles.payload}>
      {taskCount !== undefined && (
        <PayloadRow label="Tasks" value={String(taskCount)} />
      )}
      {strOrUndefined(payload['output']) && (
        <PayloadRow
          label="Output"
          value={truncate(String(payload['output']), 200)}
          prose
        />
      )}
      {strOrUndefined(payload['completion_condition']) && (
        <PayloadRow
          label="Completion"
          value={truncate(String(payload['completion_condition']), 200)}
          prose
        />
      )}
      {/*
        design_decisions retired from the dashboard prose-render
        surface in Phase 4 F3 (the ChainIndex detail-page block in
        commit-following-this also dropped). The rationale still
        rides on ChainCreated.payload.design_decisions and is
        surfaced via the structured-payload drawer click on this
        event row — the truncated PayloadRow duplicate is the one
        that retires.
      */}
    </div>
  )
}

const chainClosed: EventRenderer = (payload) => {
  if (!isRecord(payload)) return renderGenericPayload(payload)
  const summary = strOrUndefined(payload['closure_summary'])
  if (summary === undefined) return renderGenericPayload(payload)
  return (
    <div className={styles.payload}>
      <PayloadRow label="Summary" value={summary} prose />
    </div>
  )
}

// --- audit lifecycle ------------------------------------------------

const auditCompleted: EventRenderer = (payload) => {
  if (!isRecord(payload)) return renderGenericPayload(payload)
  return (
    <div className={styles.payload}>
      {strOrUndefined(payload['audit_doc']) && (
        <PayloadRow label="Audit doc" value={String(payload['audit_doc'])} prose />
      )}
      {strOrUndefined(payload['summary']) && (
        <PayloadRow
          label="Summary"
          value={truncate(String(payload['summary']), 300)}
          prose
        />
      )}
      {Array.isArray(payload['findings']) && (
        <PayloadRow
          label="Findings"
          value={`${(payload['findings'] as unknown[]).length} item(s)`}
        />
      )}
    </div>
  )
}

// --- benchmark renderers --------------------------------------------

const benchmarkStarted: EventRenderer = (payload) => {
  if (!isRecord(payload)) return renderGenericPayload(payload)
  const prov = payload['provenance']
  if (!isRecord(prov)) return renderGenericPayload(payload)
  return (
    <div className={styles.payload}>
      {strOrUndefined(payload['scenario_id']) && (
        <PayloadRow label="Scenario" value={String(payload['scenario_id'])} />
      )}
      {strOrUndefined(prov['model_id']) && (
        <PayloadRow
          label="Model"
          value={`${String(prov['model_id'])}${prov['model_version'] !== undefined ? ` · ${String(prov['model_version'])}` : ''}`}
        />
      )}
      {strOrUndefined(prov['prompt_template_hash']) && (
        <PayloadRow
          label="Prompt template"
          value={truncate(String(prov['prompt_template_hash']), 16)}
        />
      )}
      {strOrUndefined(prov['corpus_hash']) && (
        <PayloadRow
          label="Corpus"
          value={truncate(String(prov['corpus_hash']), 16)}
        />
      )}
      {strOrUndefined(prov['retriever_version']) && (
        <PayloadRow label="Retriever" value={String(prov['retriever_version'])} />
      )}
      {strOrUndefined(prov['retriever_config_hash']) && (
        <PayloadRow
          label="Retriever config"
          value={truncate(String(prov['retriever_config_hash']), 16)}
        />
      )}
      {prov['seed'] !== undefined && (
        <PayloadRow label="Seed" value={String(prov['seed'])} />
      )}
      {strOrUndefined(prov['env_hash']) && (
        <PayloadRow
          label="Env"
          value={truncate(String(prov['env_hash']), 16)}
        />
      )}
    </div>
  )
}

const benchmarkCompleted: EventRenderer = (payload) => {
  if (!isRecord(payload)) return renderGenericPayload(payload)
  return (
    <div className={styles.payload}>
      {typeof payload['score'] === 'number' && (
        <PayloadRow label="Score" value={String(payload['score'])} />
      )}
      {typeof payload['wall_clock_ms'] === 'number' && (
        <PayloadRow label="Wall time" value={`${String(payload['wall_clock_ms'])}ms`} />
      )}
      {typeof payload['input_tokens'] === 'number' && (
        <PayloadRow label="Input tokens" value={String(payload['input_tokens'])} />
      )}
      {typeof payload['output_tokens'] === 'number' && (
        <PayloadRow label="Output tokens" value={String(payload['output_tokens'])} />
      )}
    </div>
  )
}

const benchmarkFailed: EventRenderer = (payload) => {
  if (!isRecord(payload)) return renderGenericPayload(payload)
  return (
    <div className={styles.payload}>
      {strOrUndefined(payload['error_kind']) && (
        <PayloadRow label="Error kind" value={String(payload['error_kind'])} />
      )}
      {strOrUndefined(payload['error_detail']) && (
        <PayloadRow
          label="Detail"
          value={truncate(String(payload['error_detail']), 300)}
        />
      )}
    </div>
  )
}

// --- registry -------------------------------------------------------

/**
 * The per-type renderer table. Keys are event-type strings matching the
 * Go `type` column. Lookups fall through to renderGenericPayload when a
 * type isn't registered — forward compatibility for new types.
 */
const renderers: Record<string, EventRenderer> = {
  BugReported: bugReported,
  BugTriaged: updatedFieldsList,
  BugResolved: bugResolved,
  BugReopened: bugReopened,
  BugEdited: updatedFieldsList,
  BugStamped: bugStamped,
  TaskCreated: taskCreated,
  TaskCompleted: taskCompleted,
  TaskCancelled: taskCancelled,
  TaskTransitioned: taskTransitioned,
  TaskEdited: updatedFieldsList,
  TaskStamped: bugStamped, // same shape: { commit_sha }
  ChainCreated: chainCreated,
  ChainClosed: chainClosed,
  ChainEdited: updatedFieldsList,
  ArchitectureAuditCompleted: auditCompleted,
  ConventionAuditCompleted: auditCompleted,
  SubstrateFrontendAuditCompleted: auditCompleted,
  TelemetryAuditCompleted: auditCompleted,
  TelemetryFrontendAuditCompleted: auditCompleted,
  ActionDocsFrontendAuditCompleted: auditCompleted,
  ReferenceResolutionAuditCompleted: auditCompleted,
  ReferenceResolutionMigrationAuditCompleted: auditCompleted,
  ReferenceResolutionFrontendAuditCompleted: auditCompleted,
  BenchmarkRunStarted: benchmarkStarted,
  BenchmarkRunCompleted: benchmarkCompleted,
  BenchmarkRunFailed: benchmarkFailed,
}

/**
 * Look up the renderer for an event type. Unknown types render via the
 * generic pretty-printed-JSON fallback.
 */
export function renderEventPayload(
  eventType: string,
  payload: unknown,
  context: RendererContext,
): React.ReactNode {
  const renderer = renderers[eventType]
  if (renderer === undefined) {
    return renderGenericPayload(payload)
  }
  return renderer(payload, context)
}

/** Test-only helper: enumerate the registered event types. */
export function registeredEventTypes(): string[] {
  return Object.keys(renderers)
}
