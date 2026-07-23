import styles from './LoadingSpinner.module.css'

interface LoadingSpinnerProps {
  label?: string
}

export function LoadingSpinner({ label = 'Loading…' }: LoadingSpinnerProps) {
  return (
    <div className={styles.root} role="status" aria-label={label}>
      <span className={styles.spinner} aria-hidden="true" />
    </div>
  )
}
