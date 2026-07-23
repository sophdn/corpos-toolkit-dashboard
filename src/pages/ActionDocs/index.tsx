import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  type ActionDoc,
  type ActionDocsResponse,
  actionDocsDetailPath,
  dispatchPolicyAnchor,
  getActionDocs,
} from '../../api/actionDocs'
import styles from './ActionDocs.module.css'

const GENERAL_ACTION = '_general'

/**
 * ActionDocsPage — operator's view of the per-action documentation
 * corpus. Loads the embedded action-docs chunks via observe-http
 * /admin/action-docs (which serves the startup-loaded actiondocs.Registry;
 * ?reload=1 re-reads the embedded corpus, or a --action-docs-dir override).
 *
 * One component owns three routes:
 *   /docs/actions                       — index, default surface tab
 *   /docs/actions/:surface              — surface tab active
 *   /docs/actions/:surface/:action      — detail view alongside list
 *
 * See docs/ACTION_DOCS_FRONTEND.md for the full design.
 */
export function ActionDocsPage() {
  const { surface: routeSurface, action: routeAction } = useParams<{
    surface?: string
    action?: string
  }>()
  const navigate = useNavigate()

  const [data, setData] = useState<ActionDocsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (abortRef.current !== null) abortRef.current.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setLoading(true)
    setError(null)
    getActionDocs(ctrl.signal, reloadTick > 0 ? { reload: true } : undefined)
      .then((resp) => {
        setData(resp)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return
        setError(err instanceof Error ? err.message : 'unknown error')
        setLoading(false)
      })

    return () => ctrl.abort()
  }, [reloadTick])

  const surfaces = useMemo(() => data?.surfaces ?? [], [data])

  // The active surface comes from the route. If the route omits one,
  // default to the alphabetically-first surface so the page is usable
  // without deep-linking.
  const activeSurface = routeSurface ?? surfaces[0] ?? null

  const activeDoc: ActionDoc | null = useMemo(() => {
    if (data === null || activeSurface === null || routeAction === undefined) return null
    return data.actions[activeSurface]?.[routeAction] ?? null
  }, [data, activeSurface, routeAction])

  return (
    <div className={styles.page} data-testid="action-docs-page">
      <h1 className={styles.title}>Action docs</h1>
      <p className={styles.hint}>
        Per-action documentation loaded from{' '}
        <code className={styles.pathCode}>{data?.corpus_path ?? 'embedded'}</code>.
        Read-only — editing requires a PR and server restart.
      </p>

      <div className={styles.headerRow}>
        <button
          type="button"
          className={styles.reloadBtn}
          onClick={() => setReloadTick((t) => t + 1)}
          data-testid="action-docs-reload"
        >
          Reload from disk
        </button>
        {data !== null && data.count === 0 && !loading && error === null && (
          <span data-testid="action-docs-empty" className={styles.empty}>
            No docs loaded — the action-docs corpus is empty or absent.
          </span>
        )}
      </div>

      {loading ? (
        <p data-testid="action-docs-loading" className={styles.empty}>
          Loading docs…
        </p>
      ) : error !== null ? (
        <p className={styles.error} role="alert" data-testid="action-docs-error">
          Failed to load action docs: {error}
        </p>
      ) : data === null || surfaces.length === 0 ? null : (
        <>
          {data.parse_errors.length > 0 && (
            <details className={styles.parseErrors} data-testid="action-docs-parse-errors">
              <summary>
                {data.parse_errors.length} chunk
                {data.parse_errors.length === 1 ? '' : 's'} failed to load
              </summary>
              <ul>
                {data.parse_errors.map((pe) => (
                  <li key={pe.source_file}>
                    <code>{pe.source_file}</code>: {pe.err}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <nav
            className={styles.tabs}
            role="tablist"
            aria-label="Action-doc surfaces"
            data-testid="action-docs-tabs"
          >
            {surfaces.map((surface) => (
              <Link
                key={surface}
                to={`/docs/actions/${surface}`}
                role="tab"
                aria-selected={activeSurface === surface}
                className={`${styles.tab} ${activeSurface === surface ? styles.tabActive : ''}`}
                data-testid={`action-docs-tab-${surface}`}
              >
                {surface}
              </Link>
            ))}
          </nav>

          <main className={styles.body}>
            {activeSurface !== null && (
              <SurfaceList
                surface={activeSurface}
                actions={data.actions[activeSurface] ?? {}}
                writeActions={data.write_actions}
                activeAction={routeAction ?? null}
              />
            )}
            {activeDoc !== null && activeSurface !== null ? (
              <DetailView
                doc={activeDoc}
                isWrite={data.write_actions[`${activeSurface}.${activeDoc.action}`] === true}
                onBack={() => navigate(`/docs/actions/${activeSurface}`)}
              />
            ) : routeAction !== undefined && activeSurface !== null ? (
              <section
                className={styles.detailMissing}
                data-testid="action-docs-detail-missing"
              >
                <p>
                  No chunk found for <code>{activeSurface}.{routeAction}</code>.
                </p>
                <p className={styles.hint}>
                  Either the action is registered but has no documentation chunk
                  yet (file a follow-on to author it), or the action name is
                  misspelled. The dispatch policy can list registered actions even
                  when docs are absent.
                </p>
              </section>
            ) : null}
          </main>
        </>
      )}
    </div>
  )
}

interface SurfaceListProps {
  surface: string
  actions: Record<string, ActionDoc>
  writeActions: Record<string, true>
  activeAction: string | null
}

function SurfaceList({ surface, actions, writeActions, activeAction }: SurfaceListProps) {
  const names = Object.keys(actions).sort((a, b) => {
    // _general sorts to the top so surface-wide prose is visible first.
    if (a === GENERAL_ACTION) return -1
    if (b === GENERAL_ACTION) return 1
    return a.localeCompare(b)
  })

  if (names.length === 0) {
    return (
      <section
        className={styles.empty}
        data-testid={`action-docs-surface-empty-${surface}`}
      >
        No actions registered under <code>{surface}</code>.
      </section>
    )
  }

  return (
    <section
      className={styles.list}
      aria-label={`${surface} actions`}
      data-testid={`action-docs-list-${surface}`}
    >
      <ul className={styles.listInner}>
        {names.map((name) => {
          const doc = actions[name]
          if (doc === undefined) return null
          const isGeneral = name === GENERAL_ACTION
          const key = `${surface}.${name}`
          const isWrite = writeActions[key] === true
          const isActive = activeAction === name
          return (
            <li
              key={name}
              className={`${styles.listItem} ${isActive ? styles.listItemActive : ''} ${
                isGeneral ? styles.listItemGeneral : ''
              }`}
              data-action-key={key}
              data-testid={`action-docs-row-${surface}-${name}`}
            >
              <Link
                to={actionDocsDetailPath(surface, name)}
                className={styles.listItemLink}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className={styles.listItemName}>{name}</span>
                {!isGeneral && (
                  <span
                    className={isWrite ? styles.writeChip : styles.readChip}
                    aria-label={isWrite ? 'write action' : 'read action'}
                  >
                    {isWrite ? 'write' : 'read'}
                  </span>
                )}
                {isWrite && (
                  <span className={styles.rationaleChip} aria-label="rationale required">
                    rationale
                  </span>
                )}
                <span className={styles.listItemPurpose}>
                  {truncate(doc.purpose, 100)}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

interface DetailViewProps {
  doc: ActionDoc
  isWrite: boolean
  onBack: () => void
}

function DetailView({ doc, isWrite, onBack }: DetailViewProps) {
  return (
    <article
      className={styles.detail}
      data-testid={`action-docs-detail-${doc.surface}-${doc.action}`}
      aria-labelledby="action-docs-detail-title"
    >
      <header className={styles.detailHeader}>
        <button
          type="button"
          className={styles.backBtn}
          onClick={onBack}
          data-testid="action-docs-detail-back"
        >
          ← back to {doc.surface}
        </button>
        <h2 id="action-docs-detail-title" className={styles.detailTitle}>
          <code>
            {doc.surface}.{doc.action}
          </code>
        </h2>
        <div className={styles.detailChips}>
          <span
            className={isWrite ? styles.writeChip : styles.readChip}
            data-testid="action-docs-detail-kind"
          >
            {isWrite ? 'write' : 'read'}
          </span>
          <span
            className={isWrite ? styles.rationaleChip : styles.rationaleChipMuted}
            data-testid="action-docs-detail-rationale"
          >
            {isWrite ? 'rationale required' : 'no rationale required'}
          </span>
          <a
            className={styles.policyLink}
            href={`/admin/dispatch-policy#${dispatchPolicyAnchor(doc.surface, doc.action)}`}
            data-testid="action-docs-detail-policy-link"
          >
            see dispatch policy entry
          </a>
        </div>
      </header>

      <section className={styles.section} aria-labelledby="action-docs-section-purpose">
        <h3 id="action-docs-section-purpose" className={styles.sectionTitle}>
          Purpose
        </h3>
        <p className={styles.prose}>{doc.purpose}</p>
      </section>

      {doc.params !== undefined && doc.params.length > 0 && (
        <section className={styles.section} aria-labelledby="action-docs-section-params">
          <h3 id="action-docs-section-params" className={styles.sectionTitle}>
            Parameters
          </h3>
          <table className={styles.paramTable} data-testid="action-docs-detail-params">
            <thead>
              <tr>
                <th scope="col">name</th>
                <th scope="col">type</th>
                <th scope="col">required</th>
                <th scope="col">description</th>
              </tr>
            </thead>
            <tbody>
              {doc.params.map((p) => (
                <tr key={p.name}>
                  <td className={styles.paramName}>
                    <code>{p.name}</code>
                  </td>
                  <td className={styles.paramType}>{p.type}</td>
                  <td>{p.required ? 'yes' : 'no'}</td>
                  <td className={styles.paramDescription}>
                    {p.description}
                    {p.default !== undefined && p.default !== '' && (
                      <>
                        {' '}
                        <span className={styles.paramDefault}>
                          (default: <code>{p.default}</code>)
                        </span>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {doc.param_aliases !== undefined && doc.param_aliases.length > 0 && (
        <section className={styles.section} aria-labelledby="action-docs-section-param-aliases">
          <h3 id="action-docs-section-param-aliases" className={styles.sectionTitle}>
            Param aliases
          </h3>
          <ul className={styles.aliasList} data-testid="action-docs-detail-param-aliases">
            {doc.param_aliases.map((a) => (
              <li key={`${a.from}->${a.to}`}>
                <code>{a.from}</code> → <code>{a.to}</code>
                {a.notes !== undefined && a.notes !== '' && (
                  <span className={styles.aliasNotes}> — {a.notes}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {doc.value_aliases !== undefined && doc.value_aliases.length > 0 && (
        <section className={styles.section} aria-labelledby="action-docs-section-value-aliases">
          <h3 id="action-docs-section-value-aliases" className={styles.sectionTitle}>
            Value aliases
          </h3>
          <ul className={styles.aliasList} data-testid="action-docs-detail-value-aliases">
            {doc.value_aliases.map((a) => (
              <li key={`${a.param}:${a.from}->${a.to}`}>
                <code>{a.param}</code>: <code>{a.from}</code> → <code>{a.to}</code>
                {a.notes !== undefined && a.notes !== '' && (
                  <span className={styles.aliasNotes}> — {a.notes}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {doc.envelope_requirements !== undefined && doc.envelope_requirements.length > 0 && (
        <section
          className={styles.section}
          aria-labelledby="action-docs-section-envelope-requirements"
        >
          <h3
            id="action-docs-section-envelope-requirements"
            className={styles.sectionTitle}
          >
            Envelope requirements
          </h3>
          <ul
            className={styles.aliasList}
            data-testid="action-docs-detail-envelope-requirements"
          >
            {doc.envelope_requirements.map((er) => (
              <li key={er.field}>
                <code>{er.field}</code>
                {er.required ? ' (required)' : ' (optional)'}
                {er.applies_to_actor_kinds !== undefined &&
                  er.applies_to_actor_kinds.length > 0 && (
                    <span className={styles.aliasNotes}>
                      {' '}
                      — applies to: {er.applies_to_actor_kinds.join(', ')}
                    </span>
                  )}
                {er.reason !== undefined && er.reason !== '' && (
                  <p className={styles.prose}>{er.reason}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {doc.returns !== undefined && (doc.returns.shape !== undefined || doc.returns.description !== undefined) && (
        <section className={styles.section} aria-labelledby="action-docs-section-returns">
          <h3 id="action-docs-section-returns" className={styles.sectionTitle}>
            Returns
          </h3>
          <div data-testid="action-docs-detail-returns">
            {doc.returns.shape !== undefined && doc.returns.shape !== '' && (
              <p>
                Shape: <code>{doc.returns.shape}</code>
              </p>
            )}
            {doc.returns.description !== undefined && doc.returns.description !== '' && (
              <p className={styles.prose}>{doc.returns.description}</p>
            )}
          </div>
        </section>
      )}

      {doc.errors !== undefined && doc.errors.length > 0 && (
        <section className={styles.section} aria-labelledby="action-docs-section-errors">
          <h3 id="action-docs-section-errors" className={styles.sectionTitle}>
            Errors
          </h3>
          <ul className={styles.aliasList} data-testid="action-docs-detail-errors">
            {doc.errors.map((e) => (
              <li key={e.condition}>
                <code>{e.condition}</code> — {e.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      {doc.examples !== undefined && doc.examples.length > 0 && (
        <section className={styles.section} aria-labelledby="action-docs-section-examples">
          <h3 id="action-docs-section-examples" className={styles.sectionTitle}>
            Examples
          </h3>
          <div data-testid="action-docs-detail-examples">
            {doc.examples.map((ex, i) => (
              <figure key={i} className={styles.example}>
                <figcaption className={styles.exampleCaption}>{ex.description}</figcaption>
                <pre className={styles.exampleCode}>
                  <code>{ex.call}</code>
                </pre>
              </figure>
            ))}
          </div>
        </section>
      )}

      {doc.notes !== undefined && doc.notes !== '' && (
        <section className={styles.section} aria-labelledby="action-docs-section-notes">
          <h3 id="action-docs-section-notes" className={styles.sectionTitle}>
            Notes
          </h3>
          <p className={styles.prose}>{doc.notes}</p>
        </section>
      )}
    </article>
  )
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1).trimEnd() + '…'
}
