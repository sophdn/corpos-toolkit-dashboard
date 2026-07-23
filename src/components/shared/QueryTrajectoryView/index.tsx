import { useEffect, useRef, useState } from 'react'
import { getAuditEvent } from '../../../api/auditEvents'
import {
  getTrajectoryByQueryId,
  getTrajectoryBySpanId,
} from '../../../api/telemetry'
import type { AuditEventDetail } from '../../../lib/auditEvents'
import {
  CLICK_KIND_TIERS,
  type ClickKindTier,
  type TrajectoryInteraction,
  type TrajectoryResolution,
  type TrajectoryResponse,
  type TrajectoryResult,
} from '../../../lib/telemetry'
import { renderEventPayload } from '../EventTimeline/per-type-renderers'
import styles from './QueryTrajectoryView.module.css'

/**
 * QueryTrajectoryView renders the full agent-turn audit for one search
 * call: query metadata, the returned result set, every click_kind tier
 * that fired, and the write-side resolutions emitted by the prompt.
 *
 * Props are a runtime-checked XOR: pass `queryId` for path-deep-link
 * shape (/telemetry/trajectories/{queryId}), or `spanId` for tools/call
 * fan-out (one span can fire multiple grounding_events; this component
 * renders only the first when reached via spanId — span-fan-out is
 * scoped to the page wrapper, which iterates).
 *
 * Reuses substrate-frontend's renderEventPayload for the write-side leg
 * (graceful fallback to JSON pretty-print when an event type isn't
 * registered, and when the events endpoint returns an error).
 *
 * See docs/TELEMETRY_FRONTEND.md §7.1 for the contract.
 */

export interface QueryTrajectoryViewProps {
  queryId?: number
  spanId?: string
}

export function QueryTrajectoryView(props: QueryTrajectoryViewProps) {
  const { queryId, spanId } = props
  const [trajectory, setTrajectory] = useState<TrajectoryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (abortRef.current !== null) abortRef.current.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setLoading(true)
    setError(null)
    setTrajectory(null)

    const fetcher: Promise<TrajectoryResponse | null> = (() => {
      if (queryId !== undefined && queryId > 0) {
        return getTrajectoryByQueryId(queryId, ctrl.signal)
      }
      if (spanId !== undefined && spanId !== '') {
        return getTrajectoryBySpanId(spanId, ctrl.signal).then((resp) =>
          resp.trajectories.length > 0 ? resp.trajectories[0] : null,
        )
      }
      return Promise.reject(
        new Error('QueryTrajectoryView requires exactly one of queryId or spanId'),
      )
    })()

    fetcher
      .then((data) => {
        setTrajectory(data)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return
        const msg = err instanceof Error ? err.message : 'unknown error'
        setError(msg)
        setLoading(false)
      })

    return () => ctrl.abort()
  }, [queryId, spanId])

  if (loading) {
    return (
      <p
        data-testid="trajectory-loading"
        className={styles.placeholder}
        role="status"
      >
        Loading trajectory…
      </p>
    )
  }

  if (error !== null) {
    return (
      <p
        data-testid="trajectory-error"
        className={styles.error}
        role="alert"
      >
        Failed to load trajectory: {error}
      </p>
    )
  }

  if (trajectory === null) {
    return (
      <p data-testid="trajectory-empty" className={styles.empty}>
        No trajectory found for the requested span.
      </p>
    )
  }

  return (
    <div className={styles.root} data-testid="trajectory">
      <QueryHeader query={trajectory.query} />
      <ResultList results={trajectory.results} />
      <InteractionList interactions={trajectory.interactions} />
      <ResolutionList resolutions={trajectory.resolutions} />
    </div>
  )
}

// --- sections ---------------------------------------------------------

function QueryHeader({ query }: { query: TrajectoryResponse['query'] }) {
  return (
    <section
      className={styles.section}
      aria-labelledby="trajectory-query-heading"
      data-testid="trajectory-query-header"
    >
      <h3 id="trajectory-query-heading" className={styles.sectionHeading}>
        Query
      </h3>
      <div className={styles.queryHeader}>
        {query.query_text !== null && query.query_text !== '' && (
          <p className={styles.queryText} data-testid="trajectory-query-text">
            {query.query_text}
          </p>
        )}
        <div className={styles.queryMeta}>
          <span
            className={styles.actionChip}
            data-testid="trajectory-action"
            title="action (search corpus)"
          >
            {query.action}
          </span>
          <span
            className={styles.querySourceChip}
            data-testid="trajectory-query-source"
            title="query_source (who initiated)"
          >
            {query.query_source}
          </span>
          <span>{query.results_count} result{query.results_count === 1 ? '' : 's'}</span>
          <time dateTime={query.created_at}>{query.created_at}</time>
          <SpanLink spanId={query.span_id} />
        </div>
      </div>
    </section>
  )
}

function ResultList({ results }: { results: TrajectoryResult[] }) {
  return (
    <section
      className={styles.section}
      aria-labelledby="trajectory-results-heading"
      data-testid="trajectory-results"
    >
      <h3 id="trajectory-results-heading" className={styles.sectionHeading}>
        Results ({results.length})
      </h3>
      {results.length === 0 ? (
        <p className={styles.empty}>No results returned for this query.</p>
      ) : (
        <ol className={styles.results} role="list">
          {results.map((r) => (
            <li
              key={`${r.position}-${r.source_ref}`}
              className={styles.resultRow}
              data-testid={`trajectory-result-${r.position}`}
              data-source-type={r.source_type ?? 'unknown'}
            >
              <span className={styles.resultPosition}>{r.position}</span>
              <SourceTypeChip sourceType={r.source_type} />
              <span className={styles.resultRef}>{r.source_ref}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function InteractionList({
  interactions,
}: {
  interactions: TrajectoryInteraction[]
}) {
  const byTier: Record<ClickKindTier, TrajectoryInteraction[]> = {
    followed: [],
    cited: [],
    mentioned: [],
    'resolved-from': [],
  }
  for (const ix of interactions) {
    byTier[ix.click_kind].push(ix)
  }

  return (
    <section
      className={styles.section}
      aria-labelledby="trajectory-interactions-heading"
      data-testid="trajectory-interactions"
    >
      <h3
        id="trajectory-interactions-heading"
        className={styles.sectionHeading}
      >
        Interactions ({interactions.length})
      </h3>
      {CLICK_KIND_TIERS.map((tier) => (
        <TierBlock key={tier} tier={tier} rows={byTier[tier]} />
      ))}
    </section>
  )
}

function TierBlock({
  tier,
  rows,
}: {
  tier: ClickKindTier
  rows: TrajectoryInteraction[]
}) {
  return (
    <div className={styles.tierBlock} data-testid={`trajectory-tier-${tier}`}>
      <h4 className={styles.tierHeading}>
        <span className={styles.clickKindChip}>{tier}</span>
        <span>
          {rows.length} signal{rows.length === 1 ? '' : 's'}
        </span>
      </h4>
      {rows.length === 0 ? (
        <p
          className={styles.tierEmpty}
          data-testid={`trajectory-tier-${tier}-empty`}
        >
          no {tier} signals
        </p>
      ) : (
        <ul className={styles.tierRows} role="list">
          {rows.map((ix) => (
            <li
              key={ix.interaction_id}
              className={styles.interactionRow}
              data-testid={`trajectory-interaction-${ix.interaction_id}`}
            >
              <span className={styles.resultRef}>{ix.source_ref}</span>
              <span className={styles.interactionMeta}>
                weight={ix.click_weight.toFixed(2)}
                {ix.position !== null ? ` pos=${ix.position}` : ''}
                {ix.citation_kind !== null ? ` cite=${ix.citation_kind}` : ''}
                {ix.dwell_ms_estimate !== null
                  ? ` dwell=${ix.dwell_ms_estimate}ms`
                  : ''}
                {ix.was_injected === 1 ? ' injected' : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ResolutionList({
  resolutions,
}: {
  resolutions: TrajectoryResolution[]
}) {
  return (
    <section
      className={styles.section}
      aria-labelledby="trajectory-resolutions-heading"
      data-testid="trajectory-resolutions"
    >
      <h3
        id="trajectory-resolutions-heading"
        className={styles.sectionHeading}
      >
        Resolutions ({resolutions.length})
      </h3>
      {resolutions.length === 0 ? (
        <p className={styles.empty}>
          No resolutions linked to this query yet.
        </p>
      ) : (
        resolutions.map((r) => <ResolutionRow key={r.resolution_id} resolution={r} />)
      )}
    </section>
  )
}

function ResolutionRow({ resolution }: { resolution: TrajectoryResolution }) {
  return (
    <div
      className={styles.resolutionRow}
      data-testid={`trajectory-resolution-${resolution.resolution_id}`}
    >
      <div className={styles.resolutionHeader}>
        <span className={styles.resolutionEntity}>
          <span className={styles.sourceTypeChip}>{resolution.entity_kind}</span>{' '}
          {resolution.entity_slug}
        </span>
        <span className={styles.outcomeChip}>{resolution.outcome_kind}</span>
        <time dateTime={resolution.detected_at}>{resolution.detected_at}</time>
      </div>
      {resolution.write_event_ids.length > 0 && (
        <ul className={styles.eventList} role="list">
          {resolution.write_event_ids.map((eventId) => (
            <li key={eventId} className={styles.eventEntry}>
              <WriteEventEntry eventId={eventId} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * WriteEventEntry hydrates a single events.event_id and renders via
 * substrate-frontend's renderEventPayload. On fetch failure or unknown
 * event type, falls back gracefully — the fallback is the contract per
 * docs/TELEMETRY_FRONTEND.md §9 fallback matrix.
 */
function WriteEventEntry({ eventId }: { eventId: string }) {
  const [event, setEvent] = useState<AuditEventDetail | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getAuditEvent(eventId)
      .then((evt) => {
        if (cancelled) return
        setEvent(evt)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setErr(e instanceof Error ? e.message : 'fetch failed')
      })
    return () => {
      cancelled = true
    }
  }, [eventId])

  if (err !== null) {
    return (
      <div
        className={styles.eventError}
        data-testid={`trajectory-event-${eventId}-fallback`}
      >
        event {eventId} (fetch failed: {err})
      </div>
    )
  }

  if (event === null) {
    return (
      <div className={styles.eventFallback}>event {eventId} (loading…)</div>
    )
  }

  return (
    <div data-testid={`trajectory-event-${eventId}`}>
      {renderEventPayload(event.type, event.payload, {
        refs: {
          caused_by_event_id: event.caused_by_event_id,
          related_entities: event.related_entities,
        },
      })}
    </div>
  )
}

// --- atoms ------------------------------------------------------------

function SourceTypeChip({ sourceType }: { sourceType: string | null }) {
  // Renderer dispatch table keyed on source_type per TELEMETRY_FRONTEND
  // §2 — NOT on query_source or action. Unknown values fall through to
  // a generic chip so forward-compat across new knowledge_pointer kinds
  // holds without code change.
  return (
    <span
      className={styles.sourceTypeChip}
      data-testid="trajectory-result-source-type"
      data-source-type={sourceType ?? 'unknown'}
      title="source_type (knowledge_pointer kind)"
    >
      {sourceType ?? 'unknown'}
    </span>
  )
}

function SpanLink({ spanId }: { spanId: string }) {
  function handleClick() {
    if (typeof navigator !== 'undefined' && navigator.clipboard !== undefined) {
      void navigator.clipboard.writeText(spanId).catch(() => {})
    }
  }
  return (
    <a
      className={styles.spanLink}
      href={`/spans?span_id=${encodeURIComponent(spanId)}`}
      onClick={handleClick}
      data-testid="trajectory-span-link"
      title="open in SpansPanel; click also copies to clipboard"
    >
      span:{spanId.slice(0, 8)}
    </a>
  )
}
