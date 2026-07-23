import { useEffect, useMemo, useRef, useState } from 'react'
import { getAssayDetail, listAssays } from '../../api/assays'
import { matchesAssaySearch, type AssayRunDetail, type AssayRunRow } from '../../lib/assays'
import { useDebounce } from '../../hooks/useDebounce'
import { useEventTick } from '../../hooks/useEventBus'
import { useProject } from '../../hooks/useProject'
import { ControlsBar } from '../../components/shared/ControlsBar'
import { ProjectPicker } from '../../components/shared/ProjectPicker'
import { RecordCard } from '../../components/shared/RecordCard'
import { AssayDetailPanel } from './AssayDetailPanel'
import styles from './Assays.module.css'

// The Assays page surfaces behavioral-assay study runs. A run being
// recorded emits an SSE event the backend may tag as `assay_recorded`
// OR the generic `artifact_created` (kind = "study-run"); we refetch on
// either. See src/lib/events.ts.
const ASSAY_EVENT_KINDS = ['assay_recorded', 'artifact_created'] as const

export function AssaysPage() {
  const [project, setProject] = useProject()
  const [runs, setRuns] = useState<AssayRunRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [manualTick, setManualTick] = useState(0)
  const eventTick = useEventTick([...ASSAY_EVENT_KINDS])
  const tick = manualTick + eventTick

  const [assayFilter, setAssayFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const debouncedSearch = useDebounce(searchQuery, 300)

  // Assay options accumulate across fetches so a server-side assay
  // filter doesn't shrink the option list out from under the user.
  const [knownAssays, setKnownAssays] = useState<string[]>([])

  const [selectedRun, setSelectedRun] = useState<AssayRunRow | null>(null)
  const [runDetail, setRunDetail] = useState<AssayRunDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const detailAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setLoading(true)
    setError(null)

    listAssays({
      assay: assayFilter !== 'all' ? assayFilter : undefined,
      status: statusFilter !== 'all' ? statusFilter : undefined,
      project: project || undefined,
      signal: ctrl.signal,
    })
      .then(data => {
        if (!ctrl.signal.aborted) {
          setRuns(data)
          setKnownAssays(prev => {
            const merged = new Set(prev)
            for (const r of data) if (r.assay) merged.add(r.assay)
            return [...merged].sort()
          })
          setLoading(false)
        }
      })
      .catch((err: Error) => {
        if (err.name !== 'AbortError') {
          setError(err.message)
          setLoading(false)
        }
      })

    return () => ctrl.abort()
  }, [assayFilter, statusFilter, project, tick])

  useEffect(() => {
    detailAbortRef.current?.abort()
    if (!selectedRun) {
      setRunDetail(null)
      setDetailError(null)
      return
    }

    const ctrl = new AbortController()
    detailAbortRef.current = ctrl
    setDetailLoading(true)
    setDetailError(null)

    getAssayDetail(selectedRun.run_id, { signal: ctrl.signal, project: project || undefined })
      .then(detail => {
        if (!ctrl.signal.aborted) {
          setRunDetail(detail)
          setDetailLoading(false)
        }
      })
      .catch((err: Error) => {
        if (err.name !== 'AbortError') {
          setDetailError(err.message)
          setDetailLoading(false)
        }
      })

    return () => ctrl.abort()
    // Refetch the open run's detail on live events too, so an in-place
    // rescore updates the grid without a manual reselect.
  }, [selectedRun, project, tick])

  const visibleRuns = useMemo(
    () => runs.filter(r => matchesAssaySearch(r, debouncedSearch)),
    [runs, debouncedSearch],
  )

  const countLabel = loading
    ? 'Loading…'
    : `${visibleRuns.length} run${visibleRuns.length !== 1 ? 's' : ''}`

  return (
    <div className={styles.page}>
      <ProjectPicker value={project} onChange={setProject} />
      <ControlsBar
        title="Assays"
        onRefresh={() => setManualTick(t => t + 1)}
        countLabel={countLabel}
        loading={loading}
        error={error}
      />

      <div className={styles.filterRow}>
        <select
          data-testid="assay-assay-filter"
          className={styles.filterSelect}
          value={assayFilter}
          onChange={e => setAssayFilter(e.target.value)}
          aria-label="Filter by assay"
        >
          <option value="all">All assays</option>
          {knownAssays.map(a => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>

        <select
          data-testid="assay-status-filter"
          className={styles.filterSelect}
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>

        <input
          data-testid="assay-search-filter"
          className={styles.filterInput}
          type="search"
          placeholder="Search run, assay, or model…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          aria-label="Search runs by id, name, assay, item, or model"
        />
      </div>

      <div className={styles.contentArea}>
        {/* Run card list */}
        <div className={styles.listPane}>
          {!loading && !error && visibleRuns.length === 0 && (
            <p className={styles.emptyState}>No study runs match the current filters.</p>
          )}

          {visibleRuns.length > 0 && (
            <ul className={styles.recordList}>
              {visibleRuns.map(run => (
                <RecordCard
                  key={run.run_id}
                  row={{
                    slug: run.run_id,
                    title: run.name,
                    status: run.status,
                    surface: run.assay,
                    filed_at: run.run_at,
                    resolved_at: null,
                    project_id: project,
                  }}
                  selected={selectedRun?.run_id === run.run_id}
                  onSelect={() => setSelectedRun(run)}
                  testId="assay-row"
                  slugAttrName="data-run-id"
                  leadChip={
                    <span className={styles.modelChip} data-testid="assay-model-chip">
                      {run.model_id}
                    </span>
                  }
                />
              ))}
            </ul>
          )}
        </div>

        {/* Detail panel — real column, always present */}
        <aside data-testid="assay-detail-panel" className={styles.detailPane}>
          <div className={styles.detailHeader}>Run detail</div>
          {!selectedRun ? (
            <p className={styles.detailPlaceholder}>Select a run to see its details.</p>
          ) : (
            <AssayDetailPanel detail={runDetail} loading={detailLoading} error={detailError} />
          )}
        </aside>
      </div>
    </div>
  )
}
