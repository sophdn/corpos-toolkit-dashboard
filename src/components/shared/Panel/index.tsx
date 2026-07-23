import type { ReactNode } from 'react'
import styles from './Panel.module.css'

interface PanelProps {
  /** Column label rendered full-width above the header content. */
  title?: string
  /**
   * Header-row content (controls, filters, search inputs). Optional — pages
   * that only need a title (WorkSearch's Chains/Tasks columns) omit it;
   * pages with rich controls (ChainIndex's filter strip) supply it.
   */
  header?: ReactNode
  children: ReactNode
}

export function Panel({ title, header, children }: PanelProps) {
  return (
    <div data-testid="panel" className={styles.panel}>
      <div data-testid="panel-header" className={styles.header}>
        {title && <span data-testid="panel-title" className={styles.colTitle}>{title}</span>}
        {header}
      </div>
      {children}
    </div>
  )
}
