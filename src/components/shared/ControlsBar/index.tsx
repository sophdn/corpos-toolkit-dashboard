import type { ChainSortMode, ChainStatusFilter } from '../../../lib/chainIndex'
import styles from './ControlsBar.module.css'

interface ControlsBarProps {
  title?: string
  onRefresh?: () => void
  /** When provided, sort select is rendered. */
  sortMode?: ChainSortMode
  onSortChange?: (s: ChainSortMode) => void
  /** When provided, status filter select is rendered. */
  statusFilter?: ChainStatusFilter
  onStatusFilterChange?: (f: ChainStatusFilter) => void
  /** Pre-formatted count label, e.g. "2 of 5 chains" or "3 chains · 7 tasks". */
  countLabel?: string
  loading?: boolean
  error?: string | null
}

export function ControlsBar({
  title,
  onRefresh,
  sortMode,
  onSortChange,
  statusFilter,
  onStatusFilterChange,
  countLabel,
  loading,
  error,
}: ControlsBarProps) {
  return (
    <div className={styles.bar}>
      {title && <h1 className={styles.title}>{title}</h1>}
      <div className={styles.controls}>
        {onRefresh && (
          <button className={styles.btn} onClick={onRefresh}>
            Refresh
          </button>
        )}
        {sortMode !== undefined && onSortChange && (
          <select
            data-testid="chain-sort-select"
            className={styles.select}
            value={sortMode}
            onChange={e => onSortChange(e.target.value as ChainSortMode)}
            aria-label="Sort chains by"
          >
            <option value="updated-desc">Updated ↓</option>
            <option value="updated-asc">Updated ↑</option>
            <option value="slug-asc">Slug A→Z</option>
            <option value="slug-desc">Slug Z→A</option>
          </select>
        )}
        {statusFilter !== undefined && onStatusFilterChange && (
          <select
            data-testid="chain-status-filter"
            className={styles.select}
            value={statusFilter}
            onChange={e => onStatusFilterChange(e.target.value as ChainStatusFilter)}
            aria-label="Filter by status"
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="in-progress">In progress</option>
            <option value="closed">Closed</option>
          </select>
        )}
        {countLabel && (
          <span data-testid="chain-count" className={styles.count}>
            {countLabel}
          </span>
        )}
        {loading && <span className={styles.loading}>Loading…</span>}
        {error && <span className={styles.error}>{error}</span>}
      </div>
    </div>
  )
}
