import { Outlet } from 'react-router-dom'
import { useTheme } from '../../../hooks/useTheme'
import { Sidebar } from '../Sidebar'
import styles from './AppShell.module.css'

export function AppShell() {
  const { theme, toggleTheme } = useTheme()

  return (
    <div className={styles.shell}>
      <Sidebar />
      <div className={styles.body}>
        <header className={styles.header}>
          <button
            data-testid="theme-toggle"
            className={styles.themeToggle}
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
        </header>
        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
