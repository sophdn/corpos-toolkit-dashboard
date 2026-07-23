import { useEffect, useRef, useState } from 'react'
import {
  getSuggestionResolutionMix,
  listSuggestions,
  readSuggestion,
} from '../../api/suggestions'
import { getCounts } from '../../api/counts'
import {
  matchesSuggestionSearch,
  type SuggestionDetail,
  type SuggestionListRow,
  type SuggestionResolutionMix,
} from '../../lib/suggestionIndex'
import { useDebounce } from '../../hooks/useDebounce'
import { useEventTick } from '../../hooks/useEventBus'
import { useProject } from '../../hooks/useProject'
import { ControlsBar } from '../../components/shared/ControlsBar'
import { ProjectPicker } from '../../components/shared/ProjectPicker'
import { RecordCard } from '../../components/shared/RecordCard'
import { StatusMixBreakdown } from '../../components/shared/StatusMixBreakdown'
import { SuggestionDetailPanel } from './SuggestionDetailPanel'
import styles from './SuggestionIndex.module.css'

const SUGGESTION_STATUS_ORDER = ['open', 'adopted', 'deferred', 'rejected'] as const

export function SuggestionIndexPage() {
  const [project, setProject] = useProject()
  const [suggestions, setSuggestions] = useState<SuggestionListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [manualTick, setManualTick] = useState(0)
  const eventTick = useEventTick(['suggestion_filed', 'suggestion_resolved'])
  const tick = manualTick + eventTick

  const [statusFilter, setStatusFilter] = useState('open')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const debouncedSearch = useDebounce(searchQuery, 300)

  const [selectedSuggestion, setSelectedSuggestion] = useState<SuggestionListRow | null>(null)
  const [suggestionDetail, setSuggestionDetail] = useState<SuggestionDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const [resolutionMix, setResolutionMix] = useState<SuggestionResolutionMix | null>(null)
  // filteredTotal — see BugIndex/index.tsx for the architectural note;
  // same pattern, true backend count independent of the 1000-row cap.
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

    listSuggestions({
      status: statusFilter !== 'all' ? statusFilter : undefined,
      priority: priorityFilter !== 'all' ? priorityFilter : undefined,
      project: project || undefined,
      signal: ctrl.signal,
    })
      .then(data => {
        if (!ctrl.signal.aborted) {
          setSuggestions(data.suggestions)
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
  }, [statusFilter, priorityFilter, project, tick])

  useEffect(() => {
    mixAbortRef.current?.abort()
    const ctrl = new AbortController()
    mixAbortRef.current = ctrl

    getSuggestionResolutionMix({ signal: ctrl.signal, project: project || undefined })
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

  // True backend count for the active status+priority filter set —
  // the count label's authoritative source, independent of the
  // 1000-row list cap. See BugIndex/index.tsx for the pattern note.
  useEffect(() => {
    countAbortRef.current?.abort()
    const ctrl = new AbortController()
    countAbortRef.current = ctrl
    setFilteredTotal(null)

    getCounts('suggestions', {
      status: statusFilter !== 'all' ? statusFilter : undefined,
      priority: priorityFilter !== 'all' ? priorityFilter : undefined,
      project: project || undefined,
      signal: ctrl.signal,
    })
      .then(resp => {
        if (!ctrl.signal.aborted) setFilteredTotal(resp.total)
      })
      .catch((err: Error) => {
        if (err.name !== 'AbortError') {
          // Non-fatal — label falls back to visible.length.
        }
      })

    return () => ctrl.abort()
  }, [statusFilter, priorityFilter, project, tick])

  useEffect(() => {
    detailAbortRef.current?.abort()
    if (!selectedSuggestion) {
      setSuggestionDetail(null)
      setDetailError(null)
      return
    }

    const ctrl = new AbortController()
    detailAbortRef.current = ctrl
    setDetailLoading(true)
    setDetailError(null)

    readSuggestion(selectedSuggestion.slug, { signal: ctrl.signal })
      .then(detail => {
        if (!ctrl.signal.aborted) {
          setSuggestionDetail(detail)
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
  }, [selectedSuggestion])

  const visible = suggestions.filter(s => matchesSuggestionSearch(s, debouncedSearch))

  const countLabel = loading
    ? 'Loading…'
    : filteredTotal !== null && filteredTotal !== visible.length
      ? `${visible.length} of ${filteredTotal} suggestion${filteredTotal !== 1 ? 's' : ''}`
      : `${visible.length} suggestion${visible.length !== 1 ? 's' : ''}`

  return (
    <div className={styles.page}>
      <ProjectPicker value={project} onChange={setProject} />
      <ControlsBar
        title="Suggestion Index"
        onRefresh={() => setManualTick(t => t + 1)}
        countLabel={countLabel}
        loading={loading}
        error={error}
      />

      <div className={styles.filterRow}>
        <select
          data-testid="suggestion-status-filter"
          className={styles.filterSelect}
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="adopted">Adopted</option>
          <option value="deferred">Deferred</option>
          <option value="rejected">Rejected</option>
        </select>

        <select
          data-testid="suggestion-priority-filter"
          className={styles.filterSelect}
          value={priorityFilter}
          onChange={e => setPriorityFilter(e.target.value)}
          aria-label="Filter by priority"
        >
          <option value="all">All priorities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>

        <input
          data-testid="suggestion-search-filter"
          className={styles.filterInput}
          type="search"
          placeholder="Search slug, title, or surface…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          aria-label="Search suggestions by slug, title, or surface"
        />
      </div>

      {resolutionMix !== null && (
        <StatusMixBreakdown
          statusOrder={SUGGESTION_STATUS_ORDER}
          counts={resolutionMix as unknown as Record<string, number>}
        />
      )}

      <div className={styles.contentArea}>
        {/* Suggestion card list */}
        <div className={styles.listPane}>
          {!loading && !error && visible.length === 0 && (
            <p className={styles.emptyState}>No suggestions match the current filters.</p>
          )}

          {visible.length > 0 && (
            <ul className={styles.recordList}>
              {visible.map(suggestion => (
                <RecordCard
                  key={suggestion.slug}
                  row={suggestion}
                  selected={selectedSuggestion?.slug === suggestion.slug}
                  onSelect={() => setSelectedSuggestion(suggestion)}
                  testId="suggestion-row"
                  slugAttrName="data-suggestion-slug"
                  leadChip={
                    <span
                      className={`${styles.priorityChip} ${styles[`priority--${suggestion.priority}`]}`}
                      data-testid="priority-chip"
                    >
                      {suggestion.priority}
                    </span>
                  }
                />
              ))}
            </ul>
          )}
        </div>

        {/* Detail panel — real column, always present */}
        <aside data-testid="suggestion-detail-panel" className={styles.detailPane}>
          <div className={styles.detailHeader}>Details</div>
          {!selectedSuggestion ? (
            <p className={styles.detailPlaceholder}>Select a suggestion to see its details.</p>
          ) : (
            <SuggestionDetailPanel
              detail={suggestionDetail}
              loading={detailLoading}
              error={detailError}
            />
          )}
        </aside>
      </div>
    </div>
  )
}
