import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useSpanStream, type SpanEvent } from '../../hooks/useSpanStream'
import styles from './Spans.module.css'

/**
 * SpansPanel renders the live `/events/spans` SSE feed as a tree
 * grouped by trace_id. Each top-level row is a request-root span; its
 * children (in-transaction hooks, FTS5 sync, downstream RPCs) nest
 * underneath, sorted by `started_at`.
 *
 * Bare-minimum tree view per the T5 acceptance criterion (UX polish
 * deferred to a follow-on chain). Status badges distinguish in-flight
 * (`span_open` with no matching close yet), ok-closed, and error-
 * closed spans; expanding a row shows its child list.
 *
 * When mounted with a `?span_id=<uuid>` query param (e.g. from the
 * substrate audit-ledger's <SpanLink>), the tree filters to traces
 * containing that span. If the span isn't in the live buffer (rolled
 * out, or pre-existed before the page was opened), an empty-state
 * surfaces the id for clipboard copy. See bug
 * spans-panel-missing-span-id-query-param-filter and
 * docs/SUBSTRATE_FRONTEND.md §5.2.
 */
export function SpansPanel() {
  const events = useSpanStream(500)
  const [searchParams] = useSearchParams()
  const focusedSpanID = searchParams.get('span_id')
  const allTraces = useMemo(() => groupByTrace(events), [events])

  const traces = useMemo(() => {
    if (focusedSpanID === null || focusedSpanID === '') return allTraces
    return allTraces.filter((t) =>
      t.spans.some((s) => s.spanID === focusedSpanID),
    )
  }, [allTraces, focusedSpanID])

  const focusedNotInBuffer =
    focusedSpanID !== null && focusedSpanID !== '' && traces.length === 0

  return (
    <div className={styles.panel}>
      <h1 className={styles.title}>Live span tree</h1>
      <p className={styles.hint}>
        Streaming from <code>/events/spans</code>. Newest traces first; each
        trace groups every span sharing the same root <code>trace_id</code>.
        Open spans (no close yet) show as in-flight.
      </p>

      {focusedSpanID !== null && focusedSpanID !== '' && (
        <FocusedSpanBanner spanID={focusedSpanID} found={!focusedNotInBuffer} />
      )}

      {focusedNotInBuffer ? (
        <FocusedNotInBuffer spanID={focusedSpanID} />
      ) : traces.length === 0 ? (
        <p className={styles.empty} data-testid="spans-panel-empty">
          No spans yet — issue an MCP <code>tools/call</code> and it will
          appear here within a few hundred milliseconds.
        </p>
      ) : (
        <ul className={styles.traceList} data-testid="spans-panel-trace-list">
          {traces.map((t) => (
            <TraceRow
              key={t.traceID}
              trace={t}
              highlightSpanID={focusedSpanID ?? undefined}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function FocusedSpanBanner({
  spanID,
  found,
}: {
  spanID: string
  found: boolean
}) {
  return (
    <p className={styles.hint} data-testid="spans-panel-focus-banner">
      {found
        ? `Filtered to span ${spanID} — clear the ?span_id= query to see the full tree.`
        : `Looking for span ${spanID} in the live buffer.`}
    </p>
  )
}

function FocusedNotInBuffer({ spanID }: { spanID: string }) {
  function copy() {
    if (typeof navigator !== 'undefined' && navigator.clipboard !== undefined) {
      void navigator.clipboard.writeText(spanID).catch(() => {})
    }
  }
  return (
    <div className={styles.empty} data-testid="spans-panel-focused-not-in-buffer">
      <p>
        Span <code>{spanID}</code> is not in the live buffer — it may have
        rolled out or pre-existed before this page was opened. Use SQL or
        wait for the next emit.
      </p>
      <button
        type="button"
        onClick={copy}
        data-testid="spans-panel-copy-span-id"
      >
        Copy span ID
      </button>
    </div>
  )
}

type SpanState = {
  spanID: string
  parentSpanID?: string
  traceID: string
  name: string
  startedAt: string
  closed: boolean
  status?: 'ok' | 'error'
  durationMS?: number
  error?: string
}

type Trace = {
  traceID: string
  root?: SpanState
  spans: SpanState[]
}

/**
 * Fold the event stream into per-trace state. Spans with matching
 * span_open + span_close collapse to one closed entry; an open without
 * a close stays in-flight. Within a trace, spans are ordered by
 * started_at ascending (oldest first) so the visual reads parent → child.
 */
function groupByTrace(events: SpanEvent[]): Trace[] {
  const bySpan = new Map<string, SpanState>()
  for (const ev of [...events].reverse()) {
    const existing = bySpan.get(ev.span_id)
    if (ev.type === 'span_open') {
      if (existing === undefined) {
        bySpan.set(ev.span_id, {
          spanID: ev.span_id,
          parentSpanID: ev.parent_span_id || undefined,
          traceID: ev.trace_id,
          name: ev.name,
          startedAt: ev.started_at,
          closed: false,
        })
      }
    } else {
      if (existing !== undefined) {
        existing.closed = true
        existing.status = ev.status
        existing.durationMS = ev.duration_ms
        existing.error = ev.error
      } else {
        // Close arrived before open — buffer-eviction race or
        // out-of-order delivery. Synthesize a partial state so the UI
        // still shows a row.
        bySpan.set(ev.span_id, {
          spanID: ev.span_id,
          parentSpanID: ev.parent_span_id || undefined,
          traceID: ev.trace_id,
          name: ev.name,
          startedAt: ev.started_at,
          closed: true,
          status: ev.status,
          durationMS: ev.duration_ms,
          error: ev.error,
        })
      }
    }
  }
  const byTrace = new Map<string, Trace>()
  for (const span of bySpan.values()) {
    if (!byTrace.has(span.traceID)) {
      byTrace.set(span.traceID, { traceID: span.traceID, spans: [] })
    }
    const t = byTrace.get(span.traceID)!
    t.spans.push(span)
    if (!span.parentSpanID) t.root = span
  }
  const out = [...byTrace.values()]
  for (const t of out) {
    t.spans.sort((a, b) => a.startedAt.localeCompare(b.startedAt))
  }
  // Newest trace first (by root's startedAt).
  out.sort((a, b) =>
    (b.root?.startedAt ?? '').localeCompare(a.root?.startedAt ?? ''),
  )
  return out
}

function TraceRow({
  trace,
  highlightSpanID,
}: {
  trace: Trace
  highlightSpanID?: string
}) {
  const root = trace.root ?? trace.spans[0]
  if (root === undefined) return null
  const children = trace.spans.filter((s) => s.spanID !== root.spanID)
  const traceContainsFocused =
    highlightSpanID !== undefined &&
    trace.spans.some((s) => s.spanID === highlightSpanID)
  return (
    <li className={styles.trace} data-testid={`spans-panel-trace-${trace.traceID}`}>
      {/* Auto-open the <details> when this trace contains the focused span. */}
      <details open={traceContainsFocused || undefined}>
        <summary>
          <SpanLabel span={root} highlighted={root.spanID === highlightSpanID} />
        </summary>
        {children.length > 0 && (
          <ul className={styles.childList}>
            {children.map((s) => (
              <li key={s.spanID} className={styles.child}>
                <SpanLabel
                  span={s}
                  highlighted={s.spanID === highlightSpanID}
                />
              </li>
            ))}
          </ul>
        )}
      </details>
    </li>
  )
}

function SpanLabel({
  span,
  highlighted,
}: {
  span: SpanState
  highlighted?: boolean
}) {
  const badge = !span.closed
    ? <span className={styles.badgePending}>open</span>
    : span.status === 'error'
      ? <span className={styles.badgeError}>error</span>
      : <span className={styles.badgeOk}>ok</span>
  const duration = span.durationMS !== undefined
    ? ` · ${span.durationMS}ms`
    : ''
  return (
    <span
      className={`${styles.spanLabel}${highlighted === true ? ` ${styles.spanLabelHighlighted}` : ''}`}
      data-testid={highlighted === true ? 'spans-panel-highlighted-span' : undefined}
    >
      {badge}
      <span className={styles.spanName}>{span.name}</span>
      <span className={styles.spanMeta}>
        {span.startedAt}{duration}
      </span>
      {span.error ? <span className={styles.errorMsg}>{span.error}</span> : null}
    </span>
  )
}
