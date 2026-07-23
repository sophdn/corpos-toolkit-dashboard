import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { actionDocsDetailPath } from '../../api/actionDocs'
import { getDispatchPolicy, type DispatchPolicyResponse } from '../../api/dispatchPolicy'
import styles from './AdminDispatchPolicy.module.css'

/**
 * AdminDispatchPolicy — operator's view of the per-action rationale
 * enforcement policy. Reads action-manifests/dispatch-policy.toml via
 * the observe-http /admin/dispatch-policy endpoint (which itself
 * loads-on-demand fresh from disk; see docs/SUBSTRATE_FRONTEND.md
 * §8.3). Surface tabs filter rows; a "Reload from disk" button forces
 * a fresh fetch.
 *
 * Read-only — editing the TOML is a PR + restart workflow per the chain
 * design (events table is closed; the policy gate gets the same
 * discipline). This page surfaces gates; it does not mutate them.
 */
export function AdminDispatchPolicyPage() {
  const [policy, setPolicy] = useState<DispatchPolicyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeSurface, setActiveSurface] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (abortRef.current !== null) abortRef.current.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setLoading(true)
    setError(null)
    getDispatchPolicy(ctrl.signal)
      .then((resp) => {
        setPolicy(resp)
        setLoading(false)
        // Default to the first surface on initial load.
        if (activeSurface === null) {
          const surfaces = Object.keys(resp.surfaces).sort()
          if (surfaces.length > 0) {
            setActiveSurface(surfaces[0])
          }
        }
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return
        setError(err instanceof Error ? err.message : 'unknown error')
        setLoading(false)
      })

    return () => ctrl.abort()
    // activeSurface is intentionally excluded — we only default it on
    // initial load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadTick])

  const surfaces = useMemo(
    () => (policy === null ? [] : Object.keys(policy.surfaces).sort()),
    [policy],
  )

  return (
    <div className={styles.page} data-testid="admin-dispatch-policy-page">
      <h1 className={styles.title}>Dispatch policy</h1>
      <p className={styles.hint}>
        Per-action rationale enforcement gates loaded from{' '}
        <code className={styles.pathCode}>{policy?.path ?? 'action-manifests/dispatch-policy.toml'}</code>.
        Read-only — editing requires a PR and server restart.
      </p>

      <div className={styles.headerRow}>
        <button
          type="button"
          className={styles.reloadBtn}
          onClick={() => setReloadTick((t) => t + 1)}
          data-testid="admin-dispatch-policy-reload"
        >
          Reload from disk
        </button>
        {policy !== null && !policy.loaded && (
          <span data-testid="admin-dispatch-policy-not-loaded" className={styles.empty}>
            Policy file not loaded — no rationale enforcement active.
          </span>
        )}
      </div>

      {loading ? (
        <p data-testid="admin-dispatch-policy-loading" className={styles.empty}>
          Loading policy…
        </p>
      ) : error !== null ? (
        <p
          className={styles.error}
          role="alert"
          data-testid="admin-dispatch-policy-error"
        >
          Failed to load dispatch policy: {error}
        </p>
      ) : policy === null || surfaces.length === 0 ? (
        <p data-testid="admin-dispatch-policy-empty" className={styles.empty}>
          No policy entries — every action falls through to the
          read-only-ergonomic default (no rationale enforcement).
        </p>
      ) : (
        <>
          <div className={styles.tabs} role="tablist" aria-label="Dispatch policy surfaces">
            {surfaces.map((surface) => (
              <button
                key={surface}
                type="button"
                role="tab"
                aria-selected={activeSurface === surface}
                className={`${styles.tab} ${activeSurface === surface ? styles.tabActive : ''}`}
                onClick={() => setActiveSurface(surface)}
                data-testid={`admin-dispatch-policy-tab-${surface}`}
              >
                {surface}
              </button>
            ))}
          </div>

          {activeSurface !== null && (
            <SurfaceTable
              actions={policy.surfaces[activeSurface] ?? {}}
              surface={activeSurface}
            />
          )}
        </>
      )}
    </div>
  )
}

function SurfaceTable({
  actions,
  surface,
}: {
  actions: Record<string, { requires_rationale: boolean }>
  surface: string
}) {
  const actionNames = Object.keys(actions).sort()
  if (actionNames.length === 0) {
    return (
      <p className={styles.empty} data-testid="admin-dispatch-policy-surface-empty">
        No actions registered under <code>{surface}</code>.
      </p>
    )
  }
  return (
    <table className={styles.table} data-testid={`admin-dispatch-policy-table-${surface}`}>
      <thead>
        <tr>
          <th>Action</th>
          <th>Rationale</th>
          <th>Docs</th>
        </tr>
      </thead>
      <tbody>
        {actionNames.map((action) => (
          <tr
            key={action}
            id={`${surface}.${action}`}
            data-action-key={`${surface}.${action}`}
            data-testid={`admin-dispatch-policy-row-${surface}-${action}`}
          >
            <td className={styles.actionName}>{action}</td>
            <td>
              {actions[action].requires_rationale ? (
                <span className={styles.required}>required</span>
              ) : (
                <span className={styles.notRequired}>not required</span>
              )}
            </td>
            <td>
              <Link
                to={actionDocsDetailPath(surface, action)}
                className={styles.docsLink}
                data-testid={`admin-dispatch-policy-docs-link-${surface}-${action}`}
              >
                docs
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
