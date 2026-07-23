import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './theme/tokens.css'
import App from './App'

// One-shot cleanup: the previous global useProject() hook persisted the
// selected project here. State is now page-scoped, so any leftover value
// would just sit dead in storage. Safe to remove unconditionally.
try {
  localStorage.removeItem('dashboard.project')
} catch {
  // localStorage unavailable (private browsing, etc.) — nothing to do.
}

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('#root element not found')

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
