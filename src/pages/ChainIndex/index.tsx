import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { findChain, getChainState, listChains } from '../../api/chains'
import { searchTasks } from '../../api/tasks'
import {
  applyVisibleChains,
  chainFinishedCount,
  chainProgressBucket,
  computeChainHeaderStats,
  countByStatus,
  formatUpdatedAt,
  highlightSnippet,
  type ChainSortMode,
  type ChainStateResponse,
  type ChainStatusFilter,
  type ChainSummary,
  type ChainTask,
  type FindChainResult,
  type TaskContentMatch,
} from '../../lib/chainIndex'
import { useDebounce } from '../../hooks/useDebounce'
import { useEventTick } from '../../hooks/useEventBus'
import { useProject } from '../../hooks/useProject'
import { ControlsBar } from '../../components/shared/ControlsBar'
import { EventTimeline } from '../../components/shared/EventTimeline'
import { Panel } from '../../components/shared/Panel'
import { ProjectPicker } from '../../components/shared/ProjectPicker'
import { SearchBar } from '../../components/shared/SearchBar'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { TaskDetail } from '../../components/shared/TaskDetail'
import styles from './ChainIndex.module.css'

type RightPanelMode = 'task' | 'chain'

function statusFilterToChainStatus(f: ChainStatusFilter): string | null {
  if (f === 'closed') return 'closed'
  if (f === 'in-progress' || f === 'pending') return 'open'
  return null
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ChainIndexPage() {
  const [searchParams] = useSearchParams()
  const initialChain = searchParams.get('chain')
  const initialTask  = searchParams.get('task')

  // Chain list (left column)
  const [project, setProject] = useProject()
  const [chains, setChains] = useState<ChainSummary[]>([])
  const [chainsLoading, setChainsLoading] = useState(true)
  const [chainsError, setChainsError] = useState<string | null>(null)
  // Manual refresh tick + auto-refresh on relevant SSE events.
  const [manualTick, setManualTick] = useState(0)
  const eventTick = useEventTick(['task_completed', 'task_transitioned'])
  const tick = manualTick + eventTick

  // Controls
  const [sortMode, setSortMode] = useState<ChainSortMode>('updated-desc')
  const [statusFilter, setStatusFilter] = useState<ChainStatusFilter>('in-progress')
  const [visibleCount, setVisibleCount] = useState(0)

  // Selection — seeded from URL params so /work/search can deep-link here
  const [selectedSlug, setSelectedSlug] = useState<string | null>(initialChain)
  const [selectedTask, setSelectedTask] = useState<string | null>(initialTask)
  const [rightPanelMode, setRightPanelMode] = useState<RightPanelMode>(
    initialTask ? 'task' : 'chain',
  )

  // Chain detail
  const [chainState, setChainState] = useState<ChainStateResponse | null>(null)
  const [chainStateLoading, setChainStateLoading] = useState(false)
  const [chainStateError, setChainStateError] = useState<string | null>(null)
  const detailAbort = useRef<AbortController | null>(null)

  // Find-chain search (left panel)
  const [findQuery, setFindQuery] = useState('')
  const [findResults, setFindResults] = useState<FindChainResult[] | null>(null)
  const [findLoading, setFindLoading] = useState(false)
  const [findError, setFindError] = useState<string | null>(null)
  const findAbort = useRef<AbortController | null>(null)
  const debouncedFindQuery = useDebounce(findQuery, 300)

  // Task content search (middle panel) — scoped to selected chain when one is chosen
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<TaskContentMatch[] | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const searchAbort = useRef<AbortController | null>(null)
  const debouncedSearchQuery = useDebounce(searchQuery, 300)

  // Fetch chain list on mount + refresh
  useEffect(() => {
    let cancelled = false
    setChainsLoading(true)
    setChainsError(null)

    // includeClosed: true so the status-filter dropdown's `closed` and `all`
    // options have data to filter against — the /chains endpoint defaults
    // to excluding closed chains, but the UI promises both buckets.
    listChains({ project: project || undefined, includeClosed: true })
      .then(data => {
        if (!cancelled) {
          setChains(data.chains)
          setChainsLoading(false)
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setChainsError(err.message)
          setChainsLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [tick, project])

  // Fetch chain state when selection changes
  useEffect(() => {
    if (!selectedSlug) {
      setChainState(null)
      return
    }

    detailAbort.current?.abort()
    const ctrl = new AbortController()
    detailAbort.current = ctrl

    setChainStateLoading(true)
    setChainStateError(null)

    getChainState(selectedSlug, { signal: ctrl.signal })
      .then(data => {
        if (!data.found) {
          setChainStateError(data.error ?? `Chain '${selectedSlug}' not found.`)
          setChainState(null)
        } else {
          setChainState(data)
        }
        setChainStateLoading(false)
      })
      .catch((err: Error) => {
        if (err.name !== 'AbortError') {
          setChainStateError(err.message)
          setChainStateLoading(false)
        }
      })

    return () => ctrl.abort()
  }, [selectedSlug, tick])

  // Find-chain effect
  useEffect(() => {
    if (!debouncedFindQuery.trim()) {
      setFindResults(null)
      setFindError(null)
      return
    }

    findAbort.current?.abort()
    const ctrl = new AbortController()
    findAbort.current = ctrl
    setFindLoading(true)
    setFindError(null)

    findChain(debouncedFindQuery, true, { signal: ctrl.signal })
      .then(data => {
        if (!ctrl.signal.aborted) {
          setFindResults(data.results)
          setFindLoading(false)
        }
      })
      .catch((err: Error) => {
        if (err.name !== 'AbortError') {
          setFindError(err.message)
          setFindLoading(false)
        }
      })

    return () => ctrl.abort()
  }, [debouncedFindQuery])

  // Task content search — scoped to selected chain, or filtered by chain_status when none selected
  useEffect(() => {
    if (!debouncedSearchQuery.trim()) {
      setSearchResults(null)
      setSearchError(null)
      return
    }

    searchAbort.current?.abort()
    const ctrl = new AbortController()
    searchAbort.current = ctrl
    setSearchLoading(true)
    setSearchError(null)

    searchTasks({
      pattern: debouncedSearchQuery,
      chainSlug: selectedSlug ?? undefined,
      chainStatus: selectedSlug ? undefined : statusFilterToChainStatus(statusFilter) ?? undefined,
      signal: ctrl.signal,
    })
      .then(data => {
        if (!ctrl.signal.aborted) {
          setSearchResults(data.matches)
          setSearchLoading(false)
        }
      })
      .catch((err: Error) => {
        if (err.name !== 'AbortError') {
          setSearchError(err.message)
          setSearchLoading(false)
        }
      })

    return () => ctrl.abort()
  }, [debouncedSearchQuery, selectedSlug, statusFilter])

  const findActive = debouncedFindQuery.trim().length > 0

  const visibleChains = useMemo(() => {
    const findSlugs = findActive && findResults !== null
      ? new Set(findResults.map(r => r.slug))
      : null
    return applyVisibleChains(chains, statusFilter, sortMode, findSlugs)
  }, [chains, statusFilter, sortMode, findActive, findResults])

  useEffect(() => {
    setVisibleCount(visibleChains.length)
  }, [visibleChains.length])

  function handleSelectChain(slug: string) {
    setSelectedSlug(slug)
    setSelectedTask(null)
    setRightPanelMode('chain')
  }

  function handleSelectTask(task: ChainTask) {
    setSelectedTask(task.slug)
    setRightPanelMode('task')
  }

  // Clicking a task search result selects its parent chain, marks the task,
  // and switches to task mode — without clearing the search query.
  function handleSelectMatch(match: TaskContentMatch) {
    setSelectedSlug(match.chain_slug)
    setSelectedTask(match.task_slug)
    setRightPanelMode('task')
  }

  const selectedSummary = chains.find(c => c.slug === selectedSlug) ?? null

  const countLabel = `${visibleCount} of ${chains.length} ${chains.length === 1 ? 'chain' : 'chains'}`

  const searchPlaceholder = selectedSlug
    ? `search in ${selectedSlug}…`
    : 'search all tasks…'

  return (
    <div className={styles.page}>
      <ProjectPicker value={project} onChange={setProject} />
      <ControlsBar
        title="Task Planning Dash"
        onRefresh={() => setManualTick(t => t + 1)}
        sortMode={sortMode}
        onSortChange={s => { setSortMode(s); setSelectedSlug(null); setManualTick(t => t + 1) }}
        statusFilter={statusFilter}
        onStatusFilterChange={f => { setStatusFilter(f); setSelectedSlug(null); setManualTick(t => t + 1) }}
        countLabel={countLabel}
        loading={chainsLoading}
        error={chainsError}
      />

      {!chainsLoading && !chainsError && (
        <ChainSummaryHeader chains={chains} />
      )}

      <div className={styles.grid}>
        <ChainListPanel
          chains={visibleChains}
          findQuery={findQuery}
          onFindQueryChange={q => { setFindQuery(q); setSelectedSlug(null) }}
          findLoading={findLoading}
          findError={findError}
          selectedSlug={selectedSlug}
          onSelect={handleSelectChain}
        />

        <TaskTablePanel
          chainState={chainState}
          loading={chainStateLoading}
          error={chainStateError}
          onSelectTask={handleSelectTask}
          selectedTask={selectedTask}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          searchPlaceholder={searchPlaceholder}
          searchResults={searchResults}
          searchLoading={searchLoading}
          searchError={searchError}
          onSelectMatch={handleSelectMatch}
        />

        <DetailPanel
          rightPanelMode={rightPanelMode}
          onToggle={setRightPanelMode}
          chainState={chainState}
          chainSummary={selectedSummary}
          selectedTask={selectedTask}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Left: chain list
// ---------------------------------------------------------------------------

function ChainListPanel({
  chains, findQuery, onFindQueryChange, findLoading, findError, selectedSlug, onSelect,
}: {
  chains: ChainSummary[]
  findQuery: string
  onFindQueryChange: (v: string) => void
  findLoading: boolean
  findError: string | null
  selectedSlug: string | null
  onSelect: (slug: string) => void
}) {
  return (
    <Panel
      title="Chains"
      header={
        <SearchBar
          placeholder="search chains…"
          value={findQuery}
          onChange={onFindQueryChange}
          loading={findLoading}
          error={findError}
          testId="chain-search"
        />
      }
    >
      {chains.length === 0 ? (
        <p className={styles.emptyText}>No chains.</p>
      ) : (
        <ul className={styles.chainList}>
          {chains.map(c => (
            <li
              key={c.slug}
              data-testid="chain-item"
              data-chain-slug={c.slug}
              aria-selected={selectedSlug === c.slug}
              className={`${styles.chainRow} ${selectedSlug === c.slug ? styles.chainRowSelected : ''}`}
              onClick={() => onSelect(c.slug)}
            >
              <div className={styles.chainRowTop}>
                <span className={styles.chainSlug}>
                  {c.id != null && (
                    <span className={styles.rowId} data-testid="chain-id">#{c.id}</span>
                  )}
                  {c.slug}
                </span>
                <span className={styles.chainProgress}>
                  {chainFinishedCount(c)}/{c.tasks_total}
                </span>
              </div>
              <div className={styles.chainRowMeta}>
                <StatusBadge status={chainProgressBucket(c)} variant="chip" />
                <span className={styles.chainUpdated}>{formatUpdatedAt(c.updated_at)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// Middle: task table + scoped content search
// ---------------------------------------------------------------------------

function TaskTablePanel({
  chainState, loading, error, onSelectTask, selectedTask,
  searchQuery, onSearchQueryChange, searchPlaceholder,
  searchResults, searchLoading, searchError, onSelectMatch,
}: {
  chainState: ChainStateResponse | null
  loading: boolean
  error: string | null
  onSelectTask: (t: ChainTask) => void
  selectedTask: string | null
  searchQuery: string
  onSearchQueryChange: (v: string) => void
  searchPlaceholder: string
  searchResults: TaskContentMatch[] | null
  searchLoading: boolean
  searchError: string | null
  onSelectMatch: (m: TaskContentMatch) => void
}) {
  const searchActive = searchQuery.trim().length > 0

  return (
    <Panel
      title="Tasks"
      header={
        <SearchBar
          placeholder={searchPlaceholder}
          value={searchQuery}
          onChange={onSearchQueryChange}
          loading={searchLoading}
          error={searchError}
          testId="task-content-search"
        />
      }
    >
      {searchActive ? (
        <ContentSearchResults
          matches={searchResults ?? []}
          pattern={searchQuery}
          onSelect={onSelectMatch}
        />
      ) : (
        <>
          {!chainState && !loading && !error && (
            <p className={styles.placeholder}>Select a chain to see its tasks.</p>
          )}
          {loading && <p className={styles.placeholder}>Loading…</p>}
          {error && <p className={styles.placeholder}>{error}</p>}
          {chainState && chainState.tasks.length === 0 && (
            <p className={styles.placeholder}>No tasks in this chain.</p>
          )}
          {chainState && chainState.tasks.length > 0 && (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>ID</th>
                  <th>Slug</th>
                  <th>Status</th>
                  <th>Problem statement</th>
                </tr>
              </thead>
              <tbody>
                {chainState.tasks.map(task => (
                  <tr
                    key={task.slug}
                    data-testid="task-row"
                    data-task-slug={task.slug}
                    aria-selected={task.slug === selectedTask}
                    className={task.slug === selectedTask ? styles.taskRowSelected : undefined}
                    onClick={() => onSelectTask(task)}
                  >
                    <td>{task.order}</td>
                    <td className={styles.rowId} data-testid="task-id">
                      {task.id != null ? `#${task.id}` : '—'}
                    </td>
                    <td className={styles.taskSlug}>{task.slug}</td>
                    <td>
                      <StatusBadge status={task.status} variant="badge" />
                    </td>
                    <td className={styles.taskExcerpt} data-testid="task-excerpt">
                      {task.problem_statement}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </Panel>
  )
}

function ContentSearchResults({
  matches, pattern, onSelect,
}: {
  matches: TaskContentMatch[]
  pattern: string
  onSelect: (m: TaskContentMatch) => void
}) {
  if (matches.length === 0) {
    return <p className={styles.placeholder}>No matches for "{pattern}".</p>
  }

  return (
    <ul className={styles.searchResultList} data-testid="content-search-results">
      {matches.map((m, i) => (
        <li
          key={`${m.chain_slug}-${m.task_slug}-${m.field}-${i}`}
          className={styles.searchResultItem}
          data-testid="content-search-result"
          onClick={() => onSelect(m)}
        >
          <div className={styles.searchResultMeta}>
            <span className={styles.searchResultTask} data-testid="search-result-task-slug">{m.task_slug}</span>
            <span className={styles.searchResultChain} data-testid="search-result-chain-slug">{m.chain_slug}</span>
            <span className={styles.searchResultField} data-testid="search-result-field">{m.field}</span>
          </div>
          <p className={styles.searchResultSnippet} data-testid="search-result-snippet">
            {highlightSnippet(m.snippet, pattern).map((seg, j) =>
              seg.highlighted
                ? <mark key={j} className={styles.searchResultHighlight}>{seg.text}</mark>
                : <span key={j}>{seg.text}</span>
            )}
          </p>
        </li>
      ))}
    </ul>
  )
}

// ---------------------------------------------------------------------------
// Right: detail panel
// ---------------------------------------------------------------------------

function DetailPanel({
  rightPanelMode, onToggle, chainState, chainSummary, selectedTask,
}: {
  rightPanelMode: RightPanelMode
  onToggle: (m: RightPanelMode) => void
  chainState: ChainStateResponse | null
  chainSummary: ChainSummary | null
  selectedTask: string | null
}) {
  return (
    <Panel
      title="Details"
      header={
        <div className={styles.toggleGroup} role="group" aria-label="Right panel mode">
          {(['task', 'chain'] as RightPanelMode[]).map(m => (
            <button
              key={m}
              data-testid={`right-panel-toggle-${m}`}
              aria-pressed={rightPanelMode === m}
              className={`${styles.toggleBtn} ${rightPanelMode === m ? styles.toggleBtnActive : ''}`}
              onClick={() => onToggle(m)}
            >
              {m === 'task' ? 'Task' : 'Chain'}
            </button>
          ))}
        </div>
      }
    >
      {rightPanelMode === 'task' ? (
        selectedTask && chainState ? (
          <TaskDetail
            taskSlug={selectedTask}
            taskStatus={chainState.tasks.find(t => t.slug === selectedTask)?.status ?? 'pending'}
            chainSlug={chainState.chain_slug}
            problemStatement={chainState.tasks.find(t => t.slug === selectedTask)?.problem_statement}
            project={chainState.project_id ?? undefined}
          />
        ) : (
          <p className={styles.placeholder}>Select a task to see its details.</p>
        )
      ) : !chainState ? (
        <p className={styles.placeholder}>Select a chain to see its context.</p>
      ) : (
        <ChainDetailContent
          chainState={chainState}
          chainSummary={chainSummary}
        />
      )}
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// Chain detail content (also used by WorkSearch page)
// ---------------------------------------------------------------------------

export function ChainDetailContent({
  chainState, chainSummary,
}: {
  chainState: ChainStateResponse
  chainSummary: ChainSummary | null
}) {
  const counts = countByStatus(chainState.tasks)
  // design_decisions retired in migration 065 (Phase 4 F2); its
  // rationale flows through ChainCreated/ChainEdited event payloads
  // surfaced by the EventTimeline below.
  const hasProse =
    chainState.completion_condition.trim() ||
    chainState.output.trim()

  return (
    <div className={styles.detailBody}>
      <div data-testid="chain-task-counts" className={styles.countStrip}>
        {[
          ['total', chainState.tasks.length],
          ['pending', counts['pending'] ?? 0],
          ['active', counts['active'] ?? 0],
          ['closed', counts['closed'] ?? 0],
          ['cancelled', counts['cancelled'] ?? 0],
        ].map(([label, n]) => (
          <span key={label} className={styles.countChip}>
            <span className={styles.countLabel}>{label}</span>
            <span className={styles.countValue}>{n}</span>
          </span>
        ))}
      </div>

      {chainSummary && (
        <div data-testid="chain-meta-strip" className={styles.metaStrip}>
          Updated {formatUpdatedAt(chainSummary.updated_at)}
        </div>
      )}

      {!hasProse && (
        <p data-testid="chain-empty-prose-note" className={styles.emptyProseNote}>
          No prose fields recorded for this chain.
        </p>
      )}
      <ProseSection title="Completion condition" body={chainState.completion_condition} />
      <ProseSection title="Output" body={chainState.output} />

      <div className={styles.proseSection} data-testid="chain-detail-timeline">
        <h4 className={styles.proseSectionTitle}>Event history</h4>
        <EventTimeline
          kind="chain"
          slug={chainState.chain_slug}
          project={chainState.project_id ?? undefined}
        />
      </div>
    </div>
  )
}

export function ProseSection({ title, body }: { title: string; body: string }) {
  if (!body.trim()) return null
  return (
    <div className={styles.proseSection}>
      <h4 className={styles.proseSectionTitle}>{title}</h4>
      <p className={styles.proseSectionBody}>{body}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Chain summary header
// ---------------------------------------------------------------------------

function ChainSummaryHeader({ chains }: { chains: ChainSummary[] }) {
  const stats = computeChainHeaderStats(chains)
  return (
    <div data-testid="chain-summary-header" className={styles.summaryHeader}>
      <div className={styles.summaryItem}>
        <span className={styles.summaryLabel}>Total</span>
        <span data-testid="summary-total" className={styles.summaryValue}>{stats.total}</span>
      </div>
      <div className={styles.summaryItem}>
        <span className={styles.summaryLabel}>Open</span>
        <span data-testid="summary-open" className={styles.summaryValue}>{stats.open}</span>
      </div>
      <div className={styles.summaryItem}>
        <span className={styles.summaryLabel}>Closed</span>
        <span data-testid="summary-closed" className={styles.summaryValue}>{stats.closed}</span>
      </div>
      <div className={styles.summaryItem}>
        <span className={styles.summaryLabel}>Tasks closed</span>
        <span data-testid="summary-tasks-closed" className={styles.summaryValue}>
          {stats.tasksClosedTotal} / {stats.tasksTotalAll}
        </span>
      </div>
    </div>
  )
}
