import styles from './StatusMixBreakdown.module.css'

export interface StatusMixBreakdownProps {
  /** Ordered list of status keys to render. Driven by per-page enum. */
  statusOrder: readonly string[]
  /** Map of status → count. Missing keys render as 0. */
  counts: Record<string, number>
  /** Outer wrapper test id (e.g. 'resolution-breakdown'). */
  testId?: string
}

/**
 * Shared resolution-mix chip strip for record-index pages. Bug and
 * suggestion indices both render the same shape: one column per status
 * value showing the label and count. The status enum + counts are
 * supplied by the page; the visual is identical across both.
 *
 * Per-chip `data-status` carries the status key so e2e tests can target
 * `[data-status="open"]` without depending on label rendering.
 */
export function StatusMixBreakdown({
  statusOrder,
  counts,
  testId = 'resolution-breakdown',
}: StatusMixBreakdownProps) {
  return (
    <div data-testid={testId} className={styles.breakdown}>
      {statusOrder.map(status => (
        <span
          key={status}
          data-testid="resolution-chip"
          data-resolution-status={status}
          data-status={status}
          className={styles.chip}
        >
          <span className={styles.label}>{status}</span>
          <span className={styles.count} data-testid="resolution-count">
            {counts[status] ?? 0}
          </span>
        </span>
      ))}
    </div>
  )
}
