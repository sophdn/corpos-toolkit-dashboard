import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { listRoadmap, getRoadmapDiff, type RoadmapEntry, type RoadmapDiff } from '../../api/roadmap'
import { ProjectPicker } from '../../components/shared/ProjectPicker'
import { ALL_PROJECTS, useProject } from '../../hooks/useProject'
import styles from './Roadmap.module.css'

/// Build the /tasks/chains query for an entry. Chain rows focus on the
/// chain itself; task rows pre-select the chain *and* the task. The
/// ChainIndex page reads ?chain= and ?task= as initial selection state.
export function chainIndexHref(args: {
  ref_kind: 'chain' | 'task'
  ref_slug: string
  chain_slug: string | null
}): string {
  if (args.ref_kind === 'chain') {
    return `/tasks/chains?chain=${encodeURIComponent(args.ref_slug)}`
  }
  // Task: chain_slug must be present for the deep-link to focus the
  // right chain. Without it, fall through to chain-only navigation
  // anchored to the task-as-slug — ChainIndex will load a missing-chain
  // empty state, which is still better than a dead anchor.
  if (!args.chain_slug) {
    return `/tasks/chains?task=${encodeURIComponent(args.ref_slug)}`
  }
  return (
    `/tasks/chains?chain=${encodeURIComponent(args.chain_slug)}` +
    `&task=${encodeURIComponent(args.ref_slug)}`
  )
}

interface PageState {
  roadmap: RoadmapEntry[]
  diff: RoadmapDiff
}

export function RoadmapPage() {
  const [state, setState] = useState<PageState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [project, setProject] = useProject()
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    setError(null)

    Promise.all([listRoadmap(ctrl.signal), getRoadmapDiff(ctrl.signal)])
      .then(([roadmap, diff]) => {
        setState({ roadmap, diff })
        setLoading(false)
      })
      .catch((err: Error) => {
        if (err.name !== 'AbortError') {
          setError(err.message)
          setLoading(false)
        }
      })
    return () => ctrl.abort()
  }, [])

  const filtered = state && project !== ALL_PROJECTS
    ? {
        roadmap: state.roadmap.filter(r => r.project_id === project),
        diff: {
          chains: state.diff.chains.filter(c => c.project_id === project),
          tasks: state.diff.tasks.filter(t => t.project_id === project),
        },
      }
    : state

  return (
    <main className={styles.page} data-testid="roadmap-page">
      <header className={styles.header}>
        <h1>Roadmap</h1>
        <p className={styles.subhead}>
          Read-only. Re-ordering happens through the chain-close-reassessment skill.
        </p>
        <ProjectPicker value={project} onChange={setProject} />
      </header>

      {loading && <p data-testid="roadmap-loading">Loading…</p>}
      {error && (
        <p data-testid="roadmap-error" className={styles.error}>
          {error}
        </p>
      )}

      {!loading && !error && filtered && (
        <>
          <section className={styles.section} data-testid="roadmap-ordered">
            <h2>Ordered backlog</h2>
            {filtered.roadmap.length === 0 ? (
              <p className={styles.empty} data-testid="roadmap-ordered-empty">
                Roadmap is empty. The next chain close will surface unplaced
                items via the reassessment ritual.
              </p>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.position}>#</th>
                    <th>Project</th>
                    <th className={styles.kind}>Kind</th>
                    <th>Slug</th>
                    <th>Chain</th>
                    <th>Status</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.roadmap.map(row => (
                    <tr key={`${row.ref_kind}:${row.ref_slug}`} data-testid="roadmap-row">
                      <td className={styles.position}>{row.position}</td>
                      <td className={styles.project} data-testid="roadmap-row-project">
                        {row.project_id}
                      </td>
                      <td className={styles.kind}>{row.ref_kind}</td>
                      <td>
                        <Link
                          to={chainIndexHref(row)}
                          className={styles.slugLink}
                          data-testid="roadmap-row-slug-link"
                        >
                          {row.ref_slug}
                        </Link>
                      </td>
                      <td>
                        {row.chain_slug ? (
                          <Link
                            to={chainIndexHref({
                              ref_kind: 'chain',
                              ref_slug: row.chain_slug,
                              chain_slug: null,
                            })}
                            className={styles.slugLink}
                            data-testid="roadmap-row-chain-link"
                          >
                            {row.chain_slug}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{row.status ?? '—'}</td>
                      <td className={styles.note}>{row.note ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className={styles.diffSection} data-testid="roadmap-diff">
            <h2>Unplaced since last reassessment</h2>
            {filtered.diff.chains.length === 0 && filtered.diff.tasks.length === 0 ? (
              <p className={styles.empty} data-testid="roadmap-diff-empty">
                No new items since last reassessment.
              </p>
            ) : (
              <>
                {filtered.diff.chains.length > 0 && (
                  <div className={styles.diffGroup}>
                    <h3>Chains</h3>
                    <ul className={styles.diffList}>
                      {filtered.diff.chains.map(c => (
                        <li key={c.slug} data-testid="roadmap-diff-chain">
                          <Link
                            to={chainIndexHref({
                              ref_kind: 'chain',
                              ref_slug: c.slug,
                              chain_slug: null,
                            })}
                            className={`${styles.diffSlug} ${styles.slugLink}`}
                            data-testid="roadmap-diff-chain-link"
                          >
                            {c.slug}
                          </Link>
                          <span className={styles.diffMeta}>
                            {c.project_id} · {c.created_at} · awaiting placement
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {filtered.diff.tasks.length > 0 && (
                  <div className={styles.diffGroup}>
                    <h3>Tasks</h3>
                    <ul className={styles.diffList}>
                      {filtered.diff.tasks.map(t => (
                        <li key={`${t.chain_slug ?? ''}:${t.slug}`} data-testid="roadmap-diff-task">
                          <Link
                            to={chainIndexHref({
                              ref_kind: 'task',
                              ref_slug: t.slug,
                              chain_slug: t.chain_slug,
                            })}
                            className={`${styles.diffSlug} ${styles.slugLink}`}
                            data-testid="roadmap-diff-task-link"
                          >
                            {t.slug}
                          </Link>
                          <span className={styles.diffMeta}>
                            {t.project_id} · {t.created_at} · awaiting placement
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </section>
        </>
      )}
    </main>
  )
}
