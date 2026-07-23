import styles from './EmptyState.module.css'

interface EmptyStateProps {
  message?: string
}

export function EmptyState({ message = 'Nothing here yet.' }: EmptyStateProps) {
  return (
    <div className={styles.root} role="status">
      <p className={styles.message}>{message}</p>
    </div>
  )
}
