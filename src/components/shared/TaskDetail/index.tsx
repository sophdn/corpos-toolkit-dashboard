import { highlightSnippet } from '../../../lib/chainIndex'
import { EventTimeline } from '../EventTimeline'
import { StatusBadge } from '../StatusBadge'
import styles from './TaskDetail.module.css'

export interface TaskDetailProps {
  taskSlug: string
  taskStatus: string
  chainSlug: string
  /** Problem statement text pulled from the parent chain's task list. */
  problemStatement?: string
  /** Field name from a task content search result. */
  field?: string
  /** Raw snippet text from a task content search result. */
  snippet?: string
  /** Term to highlight inside the snippet. */
  highlightQuery?: string
  /** When provided, a 'Go to planning dash' button is rendered. */
  onGoToPlanning?: () => void
  /**
   * When provided, an EventTimeline is rendered for the task. The
   * timeline endpoint scopes by project; omitting this prop suppresses
   * the timeline section entirely so callers that don't have project
   * context don't render a cross-project view that may be confusing.
   */
  project?: string
}

export function TaskDetail({
  taskSlug,
  taskStatus,
  chainSlug,
  problemStatement,
  field,
  snippet,
  highlightQuery,
  onGoToPlanning,
  project,
}: TaskDetailProps) {
  return (
    <div className={styles.body}>
      <div data-testid="task-detail-slug" className={styles.slug}>{taskSlug}</div>

      <div className={styles.meta}>
        <div className={styles.metaRow}>
          <span className={styles.metaLabel}>Chain</span>
          <span data-testid="task-detail-chain" className={styles.metaValue}>{chainSlug}</span>
        </div>
        <div className={styles.metaRow}>
          <span className={styles.metaLabel}>Status</span>
          <StatusBadge status={taskStatus} variant="badge" />
        </div>
        {field && (
          <div className={styles.metaRow}>
            <span className={styles.metaLabel}>Field</span>
            <span data-testid="task-detail-field" className={styles.metaValue}>{field}</span>
          </div>
        )}
      </div>

      {problemStatement && (
        <div>
          <div className={styles.sectionLabel}>Problem statement</div>
          <p data-testid="task-detail-problem-statement" className={styles.sectionBody}>
            {problemStatement}
          </p>
        </div>
      )}

      {snippet && (
        <div>
          <div className={styles.sectionLabel}>Matched excerpt</div>
          <p data-testid="task-detail-snippet" className={styles.snippet}>
            {highlightSnippet(snippet, highlightQuery ?? '').map((seg, j) =>
              seg.highlighted
                ? <mark key={j} className={styles.highlight}>{seg.text}</mark>
                : <span key={j}>{seg.text}</span>
            )}
          </p>
        </div>
      )}

      {onGoToPlanning && (
        <button
          data-testid="go-to-planning"
          className={styles.goBtn}
          onClick={onGoToPlanning}
        >
          Go to planning dash →
        </button>
      )}

      {project !== undefined && (
        <div data-testid="task-detail-timeline">
          <div className={styles.sectionLabel}>Event history</div>
          <EventTimeline kind="task" slug={taskSlug} project={project} />
        </div>
      )}
    </div>
  )
}
