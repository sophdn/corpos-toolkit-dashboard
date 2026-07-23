import { useEffect, useRef, useState } from 'react'
import { getProjectTree } from '../../api/project'
import { type ProjectStatsResponse } from '../../lib/projectStats'
import { type ProjectTreeResponse, type TreeNode } from '../../lib/projectTree'
import styles from './ProjectTree.module.css'

export function ProjectTreePage() {
  const [currentPath, setCurrentPath] = useState('')
  const [data, setData] = useState<ProjectTreeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setLoading(true)
    setError(null)

    getProjectTree(currentPath, 2, ctrl.signal)
      .then(res => {
        setData(res)
        setLoading(false)
      })
      .catch((err: Error) => {
        if (err.name !== 'AbortError') {
          setError(err.message)
          setLoading(false)
        }
      })

    return () => ctrl.abort()
  }, [currentPath])

  const navigateTo = (path: string) => setCurrentPath(path)

  const breadcrumbSegments = currentPath ? currentPath.split('/') : []

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <h1 className={styles.title}>Project Tree</h1>
      </header>

      {data?.stats && <StatsCard stats={data.stats} />}

      <nav className={styles.breadcrumb} aria-label="Current path">
        <button className={styles.breadcrumbSegment} onClick={() => navigateTo('')}>
          root
        </button>
        {breadcrumbSegments.map((seg, i) => {
          const segPath = breadcrumbSegments.slice(0, i + 1).join('/')
          const isLast = i === breadcrumbSegments.length - 1
          return (
            <span key={segPath} style={{ display: 'contents' }}>
              <span className={styles.breadcrumbSep}>/</span>
              {isLast ? (
                <span className={styles.breadcrumbCurrent}>{seg}</span>
              ) : (
                <button className={styles.breadcrumbSegment} onClick={() => navigateTo(segPath)}>
                  {seg}
                </button>
              )}
            </span>
          )
        })}
      </nav>

      {loading && (
        <div className={styles.state} aria-live="polite">
          Loading…
        </div>
      )}
      {error && (
        <div className={styles.state} role="alert">
          {error}
        </div>
      )}
      {!loading && !error && data && !data.found && (
        <div className={styles.state}>{data.note ?? 'Path not found.'}</div>
      )}
      {!loading && !error && data?.found && data.tree && (
        <TreeView node={data.tree} currentPath={currentPath} onNavigate={navigateTo} />
      )}
    </div>
  )
}

interface StatsCardProps {
  stats: ProjectStatsResponse
}

export function StatsCard({ stats }: StatsCardProps) {
  const [open, setOpen] = useState(true)
  const breakdownEntries = Object.entries(stats.breakdown).sort(([a], [b]) => a.localeCompare(b))

  return (
    <div className={styles.statsCard} data-testid="project-stats-card">
      <div className={styles.statsCardHeader}>
        <span className={styles.statsCardTitle}>Full Project Stats</span>
        <span className={styles.statsSep} aria-hidden="true">·</span>
        <span className={styles.statItem} data-testid="stats-files">
          <span className={styles.statValue}>{stats.total_files.toLocaleString()}</span>
          <span className={styles.statLabel}>files</span>
        </span>
        <span className={styles.statsSep} aria-hidden="true">·</span>
        <span className={styles.statItem} data-testid="stats-dirs">
          <span className={styles.statValue}>{stats.total_directories.toLocaleString()}</span>
          <span className={styles.statLabel}>directories</span>
        </span>
        {breakdownEntries.length > 0 && (
          <button
            className={styles.statsToggle}
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
            aria-label={open ? 'Collapse breakdown' : 'Expand breakdown'}
            data-testid="stats-toggle"
          >
            <span className={open ? styles.caretOpen : styles.caretClosed} aria-hidden="true">▾</span>
          </button>
        )}
      </div>
      {open && breakdownEntries.length > 0 && (
        <table className={styles.breakdown} data-testid="stats-breakdown">
          <thead className={styles.breakdownHead}>
            <tr>
              <th>directory</th>
              <th>files</th>
              <th>subdirs</th>
            </tr>
          </thead>
          <tbody>
            {breakdownEntries.map(([dir, entry]) => (
              <tr key={dir} className={styles.breakdownRow} data-testid="breakdown-row">
                <td>{dir}</td>
                <td>{entry.files}</td>
                <td>{entry.subdirs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

interface TreeViewProps {
  node: TreeNode
  currentPath: string
  onNavigate: (path: string) => void
}

function TreeView({ node, currentPath, onNavigate }: TreeViewProps) {
  if (!node.children) {
    return <div className={styles.state}>Empty directory.</div>
  }

  const dirs = node.children.filter(c => c.type === 'dir')
  const files = node.children.filter(c => c.type === 'file')

  const childPath = (name: string) =>
    currentPath ? `${currentPath}/${name}` : name

  return (
    <div className={styles.tree}>
      {dirs.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>Directories</div>
          {dirs.map(dir => (
            <div
              key={dir.name}
              className={`${styles.entry} ${styles.entryDir}`}
              role="button"
              tabIndex={0}
              onClick={() => onNavigate(childPath(dir.name))}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') onNavigate(childPath(dir.name))
              }}
              data-testid="tree-dir"
            >
              <span className={styles.icon}>📁</span>
              <span className={styles.name}>{dir.name}</span>
            </div>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>Files</div>
          {files.map(file => (
            <div key={file.name} className={styles.entry} data-testid="tree-file">
              <span className={styles.icon}>📄</span>
              <span className={styles.name}>{file.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
