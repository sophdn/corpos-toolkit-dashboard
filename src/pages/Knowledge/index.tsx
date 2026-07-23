import { useEffect, useRef, useState } from 'react'
import { getKnowledgeIndexCard } from '../../api/knowledge'
import { useEventTick } from '../../hooks/useEventBus'
import type { KnowledgeIndexCard } from '../../lib/knowledgeCard'
import styles from './Knowledge.module.css'

const REFRESH_KINDS = ['knowledge_index_updated'] as const

export function KnowledgePage() {
  const [card, setCard] = useState<KnowledgeIndexCard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const tick = useEventTick([...REFRESH_KINDS])

  useEffect(() => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    setError(null)

    getKnowledgeIndexCard({ signal: ctrl.signal })
      .then((data) => {
        if (ctrl.signal.aborted) return
        setCard(data)
        setLoading(false)
      })
      .catch((err: Error) => {
        if (err.name !== 'AbortError') {
          setError(err.message)
          setLoading(false)
        }
      })

    return () => ctrl.abort()
  }, [tick])

  if (loading) return <div className={styles.emptyPage}>Loading…</div>
  if (error) return <div className={styles.error}>{error}</div>
  if (!card) return <div className={styles.emptyPage}>No data.</div>

  const { grounding_summary: gs } = card

  return (
    <div className={styles.page} data-testid="knowledge-page">
      <h1 className={styles.heading}>Knowledge Index</h1>

      {/* Summary bar */}
      <div className={styles.summaryBar} data-testid="knowledge-summary-bar">
        <div className={styles.statBox} data-testid="stat-total-pointers">
          <div className={styles.statLabel}>Active pointers</div>
          <div className={styles.statValue}>{card.total_active_pointers}</div>
        </div>
        <div className={styles.statBox} data-testid="stat-pending-candidates">
          <div className={styles.statLabel}>Pending curation</div>
          <div
            className={
              card.pending_curation_candidates > 10
                ? `${styles.statValue} ${styles.statValueWarn}`
                : styles.statValue
            }
          >
            {card.pending_curation_candidates}
          </div>
        </div>
        <div className={styles.statBox} data-testid="stat-recent-additions">
          <div className={styles.statLabel}>Added last 7 days</div>
          <div className={styles.statValue}>{card.recently_added.length}</div>
        </div>
        <div className={styles.statBox} data-testid="stat-search-calls">
          <div className={styles.statLabel}>Total search calls</div>
          <div className={styles.statValue}>{gs.total_search_calls}</div>
        </div>
      </div>

      {/* Source type breakdown */}
      <div className={styles.section}>
        <div className={styles.sectionHeading}>Source type breakdown</div>
        <div className={styles.sourceTypeBar} data-testid="source-type-breakdown">
          {card.by_source_type.length === 0 ? (
            <span className={styles.empty}>No pointers indexed yet.</span>
          ) : (
            card.by_source_type.map((st) => (
              <div
                key={st.source_type}
                className={styles.sourceTypePill}
                data-testid={`source-type-${st.source_type}`}
              >
                <span>{st.source_type}</span>
                <span className={styles.sourceTypeCount}>{st.count}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Top queried pointers */}
      <div className={styles.section}>
        <div className={styles.sectionHeading}>Top queried pointers</div>
        {card.top_queried.length === 0 ? (
          <div className={styles.empty}>No queries recorded yet.</div>
        ) : (
          <table className={styles.table} data-testid="top-queried-table">
            <thead>
              <tr>
                <th>Source type</th>
                <th>Question</th>
                <th>Queries</th>
              </tr>
            </thead>
            <tbody>
              {card.top_queried.map((p) => (
                <tr key={p.id} data-testid={`top-pointer-${p.id}`}>
                  <td>
                    <span className={styles.sourceTypeTag}>{p.source_type}</span>
                  </td>
                  <td>
                    <div className={styles.question} title={p.question}>
                      {p.question}
                    </div>
                  </td>
                  <td>{p.usage_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Recently added */}
      <div className={styles.section}>
        <div className={styles.sectionHeading}>Recently added (last 7 days)</div>
        {card.recently_added.length === 0 ? (
          <div className={styles.empty}>No pointers added in the last 7 days.</div>
        ) : (
          <table className={styles.table} data-testid="recently-added-table">
            <thead>
              <tr>
                <th>Source type</th>
                <th>Question</th>
                <th>Added</th>
              </tr>
            </thead>
            <tbody>
              {card.recently_added.map((p) => (
                <tr key={p.id} data-testid={`recent-pointer-${p.id}`}>
                  <td>
                    <span className={styles.sourceTypeTag}>{p.source_type}</span>
                  </td>
                  <td>
                    <div className={styles.question} title={p.question}>
                      {p.question}
                    </div>
                  </td>
                  <td>{p.created_at.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Grounding summary */}
      <div className={styles.section}>
        <div className={styles.sectionHeading}>Grounding summary</div>
        <div className={styles.grounding} data-testid="grounding-summary">
          <div className={styles.groundingStat}>
            <div className={styles.groundingLabel}>Search calls</div>
            <div className={styles.groundingValue} data-testid="grounding-search-calls">
              {gs.total_search_calls}
            </div>
          </div>
          <div className={styles.groundingStat}>
            <div className={styles.groundingLabel}>Used%</div>
            <div className={styles.groundingValue} data-testid="grounding-used-pct">
              {gs.total_search_calls === 0 ? '—' : `${gs.used_pct.toFixed(1)}%`}
            </div>
          </div>
          <div className={styles.groundingStat}>
            <div className={styles.groundingLabel}>Zero-result gaps</div>
            <div className={styles.groundingValue} data-testid="grounding-zero-result-gaps">
              {gs.zero_result_gap_count}
            </div>
          </div>
          <div className={styles.groundingStat}>
            <div className={styles.groundingLabel}>Pure memory sessions</div>
            <div className={styles.groundingValue} data-testid="grounding-pure-memory-sessions">
              {gs.pure_memory_sessions}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
