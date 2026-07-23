import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { listContextPullsByEntity } from '../../../api/contextPulls'
import type { AuditEntityRef } from '../../../lib/auditEvents'
import type { ContextPullByEntityResponse } from '../../../lib/contextPulls'
import styles from './EventTimeline.module.css'

/**
 * Sibling suffix block to the QF3 "preceded by N queries" extension —
 * lands "N references resolved in this prompt" inline under resolution
 * events (BugResolved / TaskCompleted / ChainClosed). RF3 ships this
 * for reference-resolution-substrate-frontend (RF1 §6.3); the
 * per-type-renderers stay pure (no fetches) so the suffix is composed
 * as a separate component by EventTimeline.
 *
 * Calls /context-pulls/by-entity/{kind}/{slug}?project=&outcome_kind=resolved.
 * Gracefully absent on network error or when the substrate is empty —
 * the absence is the dominant case (most entities don't yet have
 * recorded reference-resolution arcs).
 */

/** The event types that get the suffix. Other event types pass through
 *  unchanged. */
const RESOLUTION_EVENT_TYPES: ReadonlySet<string> = new Set([
  'BugResolved',
  'TaskCompleted',
  'ChainClosed',
])

export function eventTypeAdmitsReferencesResolvedSuffix(
  eventType: string,
): boolean {
  return RESOLUTION_EVENT_TYPES.has(eventType)
}

export function ReferencesResolvedSuffix({
  entity,
}: {
  entity: AuditEntityRef
}) {
  const [data, setData] = useState<ContextPullByEntityResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (entity.project_id === null) return
    if (abortRef.current !== null) abortRef.current.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    listContextPullsByEntity(
      entity.kind,
      entity.slug,
      { project: entity.project_id, outcome_kind: 'resolved', limit: 5 },
      ctrl.signal,
    )
      .then((resp) => setData(resp))
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return
        setError(err instanceof Error ? err.message : 'unknown error')
      })
    return () => ctrl.abort()
  }, [entity.kind, entity.slug, entity.project_id])

  // No project_id (legacy event row without project scoping) — skip
  // silently; the suffix is best-effort.
  if (entity.project_id === null) return null
  // Network error — surface a tiny absent note and move on (matches
  // F2's posture for cross-substrate joins).
  if (error !== null) return null
  // Loading: render nothing rather than a placeholder; suffix is small
  // and the spinner would dominate the timeline row.
  if (data === null) return null

  const count = data.items.length
  if (count === 0) return null

  return (
    <div
      className={styles.refsResolvedSuffix}
      data-testid={`references-resolved-suffix-${entity.kind}-${entity.slug}`}
    >
      <button
        type="button"
        className={styles.refsResolvedToggle}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        data-testid="references-resolved-toggle"
      >
        {count} reference{count === 1 ? '' : 's'} resolved in this prompt{' '}
        <span aria-hidden>{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && (
        <ul
          className={styles.refsResolvedList}
          data-testid="references-resolved-list"
        >
          {data.items.map((row) => (
            <li
              key={row.grounding_event_id}
              className={styles.refsResolvedRow}
            >
              <Link
                to={`/context-pulls?event=${row.grounding_event_id}`}
                className={styles.refsResolvedLink}
              >
                <code>{row.query_text ?? '—'}</code>
                {row.shape !== null && (
                  <span className={styles.refsResolvedShape}>{row.shape}</span>
                )}
                {row.confidence_tier !== null && (
                  <span className={styles.refsResolvedTier}>
                    {row.confidence_tier}
                  </span>
                )}
              </Link>
            </li>
          ))}
          {data.matched_prompt_ids.length > 0 && (
            <li className={styles.refsResolvedRow}>
              <Link
                to={`/context-pulls?prompt_id=${data.matched_prompt_ids[0]}`}
                className={styles.refsResolvedLink}
                data-testid="references-resolved-see-all"
              >
                See all references in this prompt →
              </Link>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
