import type { ReactNode } from 'react'
import { StatusBadge } from '../StatusBadge'
import { formatUpdatedAt } from '../../../lib/chainIndex'
import { splitSurface, type RecordIndexRow } from '../../../lib/recordIndex'
import styles from './RecordCard.module.css'

export interface RecordCardProps {
  row: RecordIndexRow
  selected?: boolean
  onSelect?: (row: RecordIndexRow) => void
  /**
   * Lead chip rendered between the project badge and the status badge.
   * Bugs pass a severity chip (low/medium/high colored by danger scale);
   * suggestions pass a priority chip with the same three values. The
   * caller controls the styling because the visual is identical but the
   * test-id and data attribute differ per vocab.
   */
  leadChip?: ReactNode
  /** Per-entity test id stamp for the card row. */
  testId?: string
  /** Per-entity slug-attr name (e.g. 'data-bug-slug'). Falls back to data-record-slug. */
  slugAttrName?: string
}

/**
 * Shared card UI for record-index pages. Bug and suggestion lists both
 * render this shape: a title line, a slug line, and a row of chips
 * (project badge, lead chip, status badge, surface tags, filed-at).
 *
 * The lead chip is the only per-vocab visual divergence — bug renders a
 * severity color (low/medium/high mapped to the danger scale), suggestion
 * renders a priority chip with the same values but the suggestion-side
 * data attribute. The shared component takes both as render-prop so the
 * per-page color choice and test-id stay in the page that owns the vocab.
 */
export function RecordCard({
  row,
  selected,
  onSelect,
  leadChip,
  testId = 'record-row',
  slugAttrName,
}: RecordCardProps) {
  const slugAttrs: Record<string, string> = {}
  if (slugAttrName) {
    slugAttrs[slugAttrName] = row.slug
  } else {
    slugAttrs['data-record-slug'] = row.slug
  }

  return (
    <li
      data-testid={testId}
      {...slugAttrs}
      aria-selected={selected ?? false}
      className={`${styles.card} ${selected ? styles.selected : ''}`}
      onClick={() => onSelect?.(row)}
    >
      <div className={styles.title}>{row.title}</div>
      <div className={styles.slug}>
        {row.id != null && (
          <span className={styles.id} data-testid="record-id">#{row.id}</span>
        )}
        {row.slug}
      </div>
      <div className={styles.tags}>
        <span
          className={styles.projectBadge}
          data-testid="record-project-badge"
          data-project={row.project_id}
        >
          {row.project_id}
        </span>
        {leadChip}
        <StatusBadge status={row.status} variant="badge" />
        {splitSurface(row.surface).map(tag => (
          <span key={tag} className={styles.surfaceTag} data-testid="surface-tag">
            {tag}
          </span>
        ))}
        <span className={styles.filed}>{formatUpdatedAt(row.filed_at)}</span>
      </div>
    </li>
  )
}
