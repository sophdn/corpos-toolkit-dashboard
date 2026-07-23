import { useEffect, useRef, useState } from 'react'
import { getBugResolutionMix, listBugs, readBug } from '../../api/bugs'
import { getCounts } from '../../api/counts'
import {
  matchesBugSearch,
  type BugDetail,
  type BugListRow,
  type BugResolutionMix,
} from '../../lib/bugIndex'
import { useDebounce } from '../../hooks/useDebounce'
import { useEventTick } from '../../hooks/useEventBus'
import { useProject } from '../../hooks/useProject'
import { ControlsBar } from '../../components/shared/ControlsBar'
import { ProjectPicker } from '../../components/shared/ProjectPicker'
import { RecordCard } from '../../components/shared/RecordCard'
import { StatusMixBreakdown } from '../../components/shared/StatusMixBreakdown'
import { BugDetailPanel } from './BugDetailPanel'
import styles from './BugIndex.module.css'

const BUG_STATUS_ORDER = ['open', 'fixed', 'wontfix', 'upstream', 'routed', 'dup'] as const

export function BugIndexPage() {
  const [project, setProject] = useProject()
  const [bugs, setBugs] = useState<BugListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [manualTick, setManualTick] = useState(0)
  const eventTick = useEventTick(['bug_filed', 'bug_resolved'])
  const tick = manualTick + eventTick

  const [statusFilter, setStatusFilter] = useState('open')
  const [severityFilter, setSeverityFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const debouncedSearch = useDebounce(searchQuery, 300)

  const [selectedBug, setSelectedBug] = useState<BugListRow | null>(null)
  const [bugDetail, setBugDetail] = useState<BugDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const [resolutionMix, setResolutionMix] = useState<BugResolutionMix | null>(null)
  // filteredTotal is the TRUE backend count of bugs matching the
  // current status+severity+project filters — independent of the
  // list endpoint's 1000-row cap. Reads via the counts module.
  // Null while loading (or on error — countLabel falls back to the
  // loaded list length so the user always sees a number).
  const [filteredTotal, setFilteredTotal] = useState<number | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const detailAbortRef = useRef<AbortController | null>(null)
  const mixAbortRef = useRef<AbortController | null>(null)
  const countAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setLoading(true)
    setError(null)

    listBugs({
      status: statusFilter !== 'all' ? statusFilter : undefined,
      severity: severityFilter !== 'all' ? severityFilter : undefined,
      project: project || undefined,
      signal: ctrl.signal,
    })
      .then(data => {
        if (!ctrl.signal.aborted) {
          setBugs(data.bugs)
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
  }, [statusFilter, severityFilter, project, tick])

  useEffect(() => {
    mixAbortRef.current?.abort()
    const ctrl = new AbortController()
    mixAbortRef.current = ctrl

    getBugResolutionMix({ signal: ctrl.signal, project: project || undefined })
      .then(mix => {
        if (!ctrl.signal.aborted) setResolutionMix(mix)
      })
      .catch((err: Error) => {
        if (err.name !== 'AbortError') {
          // Resolution mix failure is non-fatal — widget stays hidden.
        }
      })

    return () => ctrl.abort()
  }, [tick, project])

  // True backend count for the active status+severity filter set. This
  // is the authoritative number the count label uses — separate from
  // the bugs.length above which is capped at 1000 rows per request.
  useEffect(() => {
    countAbortRef.current?.abort()
    const ctrl = new AbortController()
    countAbortRef.current = ctrl
    setFilteredTotal(null)

    getCounts('bugs', {
      status: statusFilter !== 'all' ? statusFilter : undefined,
      severity: severityFilter !== 'all' ? severityFilter : undefined,
      project: project || undefined,
      signal: ctrl.signal,
    })
      .then(resp => {
        if (!ctrl.signal.aborted) setFilteredTotal(resp.total)
      })
      .catch((err: Error) => {
        if (err.name !== 'AbortError') {
          // Count failure is non-fatal — label falls back to
          // visibleBugs.length when filteredTotal is null.
        }
      })

    return () => ctrl.abort()
  }, [statusFilter, severityFilter, project, tick])

  useEffect(() => {
    detailAbortRef.current?.abort()
    if (!selectedBug) {
      setBugDetail(null)
      setDetailError(null)
      return
    }

    const ctrl = new AbortController()
    detailAbortRef.current = ctrl
    setDetailLoading(true)
    setDetailError(null)

    readBug(selectedBug.slug, { signal: ctrl.signal })
      .then(detail => {
        if (!ctrl.signal.aborted) {
          setBugDetail(detail)
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
  }, [selectedBug])

  const visibleBugs = bugs.filter(b => matchesBugSearch(b, debouncedSearch))

  // Count label resolves to the highest-fidelity number available:
  // - When loading the list, show "Loading…"
  // - When the backend count is known, show "X of N bugs" — N is the
  //   true filtered total (not the 1000-row list cap). X is the
  //   post-client-search visible row count.
  // - When N is unknown (initial fetch hasn't returned, or errored),
  //   fall back to "X bugs" from the loaded list length so the user
  //   always sees a number.
  const countLabel = loading
    ? 'Loading…'
    : filteredTotal !== null && filteredTotal !== visibleBugs.length
      ? `${visibleBugs.length} of ${filteredTotal} bug${filteredTotal !== 1 ? 's' : ''}`
      : `${visibleBugs.length} bug${visibleBugs.length !== 1 ? 's' : ''}`

  return (
    <div className={styles.page}>
      <ProjectPicker value={project} onChange={setProject} />
      <ControlsBar
        title="Bug Index"
        onRefresh={() => setManualTick(t => t + 1)}
        countLabel={countLabel}
        loading={loading}
        error={error}
      />

      <div className={styles.filterRow}>
        <select
          data-testid="bug-status-filter"
          className={styles.filterSelect}
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="fixed">Fixed</option>
          <option value="wontfix">Won't fix</option>
          <option value="upstream">Upstream</option>
          <option value="routed">Routed</option>
          <option value="dup">Duplicate</option>
        </select>

        <select
          data-testid="bug-severity-filter"
          className={styles.filterSelect}
          value={severityFilter}
          onChange={e => setSeverityFilter(e.target.value)}
          aria-label="Filter by severity"
        >
          <option value="all">All severities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>

        <input
          data-testid="bug-search-filter"
          className={styles.filterInput}
          type="search"
          placeholder="Search slug, title, or surface…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          aria-label="Search bugs by slug, title, or surface"
        />
      </div>

      {resolutionMix !== null && (
        <StatusMixBreakdown
          statusOrder={BUG_STATUS_ORDER}
          counts={resolutionMix as unknown as Record<string, number>}
        />
      )}

      <div className={styles.contentArea}>
        {/* Bug card list */}
        <div className={styles.listPane}>
          {!loading && !error && visibleBugs.length === 0 && (
            <p className={styles.emptyState}>No bugs match the current filters.</p>
          )}

          {visibleBugs.length > 0 && (
            <ul className={styles.recordList}>
              {visibleBugs.map(bug => (
                <RecordCard
                  key={bug.slug}
                  row={bug}
                  selected={selectedBug?.slug === bug.slug}
                  onSelect={() => setSelectedBug(bug)}
                  testId="bug-row"
                  slugAttrName="data-bug-slug"
                  leadChip={
                    <span
                      className={`${styles.severityChip} ${styles[`severity--${bug.severity}`]}`}
                      data-testid="severity-chip"
                    >
                      {bug.severity}
                    </span>
                  }
                />
              ))}
            </ul>
          )}
        </div>

        {/* Detail panel — real column, always present */}
        <aside data-testid="bug-detail-panel" className={styles.detailPane}>
          <div className={styles.detailHeader}>Details</div>
          {!selectedBug ? (
            <p className={styles.detailPlaceholder}>Select a bug to see its details.</p>
          ) : (
            <BugDetailPanel
              detail={bugDetail}
              loading={detailLoading}
              error={detailError}
            />
          )}
        </aside>
      </div>
    </div>
  )
}
