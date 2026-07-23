import { NavLink } from 'react-router-dom'
import styles from './Sidebar.module.css'

// Sidebar IA — chain telemetry-page-ia-unification (Chain 4). The nav is grouped
// into sections that surface the telemetry-consolidation framing: a read-side
// TELEMETRY section (inference + retrieval observability) sits next to the
// write-side AUDIT section (the event ledger + live spans). See
// docs/CHAIN4_PAGE_IA_DESIGN.md §T3 (Option A, user-vetted) and
// src/components/layout/Sidebar/index.test.tsx (the structure characterization).

interface NavItem {
  to: string
  label: string
  // `end` matches the path exactly (no active-highlight on child routes) — used
  // for section roots that also have subpaths (e.g. /telemetry).
  end?: boolean
}

interface NavSection {
  heading: string
  items: NavItem[]
}

const SECTIONS: NavSection[] = [
  {
    heading: 'Work',
    items: [
      { to: '/tasks/chains', label: 'Chains & Tasks' },
      { to: '/roadmap', label: 'Roadmap' },
      { to: '/bugs', label: 'Bug Index' },
      { to: '/suggestions', label: 'Suggestion Index' },
    ],
  },
  {
    // Read-side observability: what the substrate is doing.
    heading: 'Telemetry',
    items: [
      { to: '/inference', label: 'Inference' },
      { to: '/telemetry/model-ranking', label: 'Model Ranking' },
      { to: '/telemetry', label: 'Search Analytics', end: true },
      { to: '/context-pulls', label: 'Context Pulls' },
      { to: '/telemetry/training-pairs', label: 'Training Pairs' },
      { to: '/telemetry/snapshot-corpus', label: 'Snapshot Corpus' },
    ],
  },
  {
    // Write-side: append-only state mutations + rationale.
    heading: 'Audit',
    items: [
      { to: '/audit', label: 'Audit Ledger' },
      { to: '/spans', label: 'Live Spans' },
    ],
  },
  {
    heading: 'Knowledge',
    items: [
      { to: '/knowledge', label: 'Knowledge Index' },
      { to: '/knowledge/memory-substrate', label: 'Memory Substrate' },
    ],
  },
  {
    heading: 'ML / Benchmarks',
    items: [
      { to: '/benchmarks', label: 'Local LLM Task Performance' },
      { to: '/assays', label: 'Assays' },
      { to: '/deferred-ports', label: 'Deferred Ports' },
    ],
  },
  {
    heading: 'Admin',
    items: [
      { to: '/admin/dispatch-policy', label: 'Dispatch Policy' },
      { to: '/docs/actions', label: 'Action Docs' },
    ],
  },
]

export function Sidebar() {
  return (
    <nav className={styles.sidebar} aria-label="Main navigation">
      {SECTIONS.map((section) => (
        <div key={section.heading} className={styles.section}>
          <h2 className={styles.sectionHeading}>{section.heading}</h2>
          {section.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `${styles.navLink}${isActive ? ` ${styles.navLinkActive}` : ''}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  )
}
