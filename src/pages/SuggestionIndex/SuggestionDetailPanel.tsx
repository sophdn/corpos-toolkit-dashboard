import { formatUpdatedAt } from '../../lib/chainIndex'
import { splitSurface, type SuggestionDetail } from '../../lib/suggestionIndex'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { EventTimeline } from '../../components/shared/EventTimeline'
import styles from './SuggestionIndex.module.css'

export interface SuggestionDetailPanelProps {
  detail: SuggestionDetail | null
  loading: boolean
  error: string | null
}

export function SuggestionDetailPanel({
  detail,
  loading,
  error,
}: SuggestionDetailPanelProps) {
  if (loading) {
    return (
      <p data-testid="suggestion-detail-loading" className={styles.detailPlaceholder}>
        Loading…
      </p>
    )
  }

  if (error) {
    return (
      <p data-testid="suggestion-detail-error" className={styles.detailPlaceholder}>
        {error}
      </p>
    )
  }

  if (!detail) return null

  return (
    <div data-testid="suggestion-detail-body" className={styles.detailBody}>
      <div data-testid="suggestion-detail-slug" className={styles.detailSlug}>
        {detail.slug}
      </div>
      <p className={styles.detailTitle}>{detail.title}</p>

      <div className={styles.detailMeta}>
        <div className={styles.detailMetaRow}>
          <span className={styles.detailMetaLabel}>Status</span>
          <StatusBadge status={detail.status} variant="badge" />
        </div>
        <div className={styles.detailMetaRow}>
          <span className={styles.detailMetaLabel}>Priority</span>
          <span
            data-testid="suggestion-detail-priority"
            className={`${styles.priorityChip} ${styles[`priority--${detail.priority}` as keyof typeof styles]}`}
          >
            {detail.priority}
          </span>
        </div>
        <div className={styles.detailMetaRow}>
          <span className={styles.detailMetaLabel}>Surface</span>
          <div data-testid="suggestion-detail-surface" className={styles.surfaceCell}>
            {splitSurface(detail.surface).map(tag => (
              <span key={tag} className={styles.surfaceTag}>{tag}</span>
            ))}
          </div>
        </div>
        <div className={styles.detailMetaRow}>
          <span className={styles.detailMetaLabel}>Filed</span>
          <span className={styles.detailMetaValue}>{formatUpdatedAt(detail.filed_at)}</span>
        </div>
        {detail.resolved_at && (
          <div className={styles.detailMetaRow}>
            <span className={styles.detailMetaLabel}>Resolved</span>
            <span className={styles.detailMetaValue}>{formatUpdatedAt(detail.resolved_at)}</span>
          </div>
        )}
      </div>

      {detail.problem_statement && (
        <div className={styles.detailSection}>
          <div className={styles.detailSectionLabel}>Problem statement</div>
          <p data-testid="suggestion-detail-problem-statement" className={styles.detailSectionBody}>
            {detail.problem_statement}
          </p>
        </div>
      )}

      {detail.acceptance_criteria && (
        <div className={styles.detailSection}>
          <div className={styles.detailSectionLabel}>Acceptance criteria</div>
          <p data-testid="suggestion-detail-acceptance-criteria" className={styles.detailSectionBody}>
            {detail.acceptance_criteria}
          </p>
        </div>
      )}

      {(detail.routed_chain_slug || detail.routed_task_slug || detail.routed_bug_slug) && (
        <div>
          <div className={styles.detailMetaLabel}>Routed to</div>
          <div
            data-testid="suggestion-detail-routed-pointers"
            className={styles.detailMeta}
          >
            {detail.routed_chain_slug && (
              <div className={styles.detailMetaRow}>
                <span className={styles.detailMetaLabel}>Chain</span>
                <span className={styles.detailMetaValue}>{detail.routed_chain_slug}</span>
              </div>
            )}
            {detail.routed_task_slug && (
              <div className={styles.detailMetaRow}>
                <span className={styles.detailMetaLabel}>Task</span>
                <span className={styles.detailMetaValue}>{detail.routed_task_slug}</span>
              </div>
            )}
            {detail.routed_bug_slug && (
              <div className={styles.detailMetaRow}>
                <span className={styles.detailMetaLabel}>Bug</span>
                <span className={styles.detailMetaValue}>{detail.routed_bug_slug}</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className={styles.detailSection} data-testid="suggestion-detail-timeline">
        <div className={styles.detailSectionLabel}>Event history</div>
        <EventTimeline kind="suggestion" slug={detail.slug} project={detail.project_id} />
      </div>
    </div>
  )
}
