import styles from './SearchBar.module.css'

interface SearchBarProps {
  placeholder: string
  value: string
  onChange: (v: string) => void
  loading: boolean
  error: string | null
  testId?: string
}

export function SearchBar({ placeholder, value, onChange, loading, error, testId }: SearchBarProps) {
  return (
    <div className={styles.row}>
      <input
        data-testid={testId}
        className={styles.input}
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        aria-label={placeholder}
      />
      {loading && <span className={styles.spinner}>…</span>}
      {error && <span className={styles.error} role="alert">{error}</span>}
    </div>
  )
}
