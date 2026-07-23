import { statusLabel } from '../../../lib/chainIndex'
import styles from './StatusBadge.module.css'

export type StatusVariant = 'badge' | 'chip'

interface StatusBadgeProps {
  status: string
  /** badge = rounded rect (task rows); chip = pill (chain list progress). Default: badge. */
  variant?: StatusVariant
}

export function StatusBadge({ status, variant = 'badge' }: StatusBadgeProps) {
  const colorClass = styles[`status--${status}`] ?? ''
  return (
    <span
      data-testid="status-badge"
      className={`${styles.base} ${styles[variant]} ${colorClass}`}
      data-status={status}
      data-variant={variant}
    >
      {statusLabel(status)}
    </span>
  )
}
