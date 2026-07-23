import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { findChain, getChainState, listChains } from '../../api/chains'
import { searchTasks } from '../../api/tasks'
import {
  applyVisibleChains,
  countByStatus,
  formatUpdatedAt,
  highlightSnippet,
  type ChainSortMode,
  type ChainStateResponse,
  type ChainStatusFilter,
  type ChainSummary,
  type FindChainResult,
  type TaskContentMatch,
} from '../../lib/chainIndex'
import { useDebounce } from '../../hooks/useDebounce'
import { ControlsBar } from '../../components/shared/ControlsBar'
import { Panel } from '../../components/shared/Panel'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { TaskDetail } from '../../components/shared/TaskDetail'
import styles from './WorkSearch.module.css'

type DetailMode = 'chain' | 'task'

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function WorkSearchPage() {
  const navigate = useNavigate()

  // Search query
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounce(query, 300)

  // Controls
  const [statusFilter, setStatusFilter] = useState<ChainStatusFilter>('all')
  const [tick, setTick] = useState(0)

  // All chains (for status filtering)
  const [allChains, setAllChains] = useState<ChainSummary[]>([])

  // Chain results (from /chains/find, filtered by statusFilter)
  const [chainResults, setChainResults] = useState<FindChainResult[] | null>(null)
  const [chainsLoading, setChainsLoading] = useState(false)
  const [chainsError, setChainsError] = useState<string | null>(null)
  const chainAbort = useRef<AbortController | null>(null)

  // Task results (from /tasks/search)
  const [taskResults, setTaskResults] = useState<TaskContentMatch[] | null>(null)
  const [tasksLoading, setTasksLoading] = useState(false)
  const [tasksError, setTasksError] = useState<string | null>(null)
  const taskAbort = useRef<AbortController | null>(null)

  // Detail panel
  const [detailMode, setDetailMode] = useState<DetailMode>('chain')
  const [selectedChainSlug, setSelectedChainSlug] = useState<string | null>(null)
  const [selectedTaskMatch, setSelectedTaskMatch] = useState<TaskContentMatch | null>(null)
  const [chainDetail, setChainDetail] = useState<ChainStateResponse | null>(null)
  const [chainDetailLoading, setChainDetailLoading] = useState(false)
  const [chainDetailError, setChainDetailError] = useState<string | null>(null)
  const detailAbort = useRef<AbortController | null>(null)

  // Fetch all chain summaries for status-filter client-side filtering
  useEffect(() => {
    listChains()
      .then(d => setAllChains(d.chains))
      .catch(() => {}) // best-effort; chain find results still work without it
  }, [tick])

  // Parallel search: /chains/find + /tasks/search whenever debounced query or filter changes
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setChainResults(null)
      setTaskResults(null)
      setChainsError(null)
      setTasksError(null)
      return
    }

    // Chains
    chainAbort.current?.abort()
    const chainCtrl = new AbortController()
    chainAbort.current = chainCtrl
    setChainsLoading(true)
    setChainsError(null)

    findChain(debouncedQuery, true, { signal: chainCtrl.signal })
      .then(data => {
        if (!chainCtrl.signal.aborted) {
          setChainResults(data.results)
          setChainsLoading(false)
        }
      })
      .catch((err: Error) => {
        if (err.name !== 'AbortError') {
          setChainsError(err.message)
          setChainsLoading(false)
        }
      })

    // Tasks
    taskAbort.current?.abort()
    const taskCtrl = new AbortController()
    taskAbort.current = taskCtrl
    setTasksLoading(true)
    setTasksError(null)

    const chainStatus =
      statusFilter === 'closed' ? 'closed' :
      (statusFilter === 'in-progress' || statusFilter === 'pending') ? 'open' :
      undefined

    searchTasks({ pattern: debouncedQuery, chainStatus }, taskCtrl.signal)
      .then(data => {
        if (!taskCtrl.signal.aborted) {
          setTaskResults(data.matches)
          setTasksLoading(false)
        }
      })
      .catch((err: Error) => {
        if (err.name !== 'AbortError') {
          setTasksError(err.message)
          setTasksLoading(false)
        }
      })

    return () => {
      chainAbort.current?.abort()
      taskAbort.current?.abort()
    }
  }, [debouncedQuery, statusFilter, tick])

  // Fetch chain detail when selected chain changes
  useEffect(() => {
    if (!selectedChainSlug) {
      setChainDetail(null)
      return
    }

    detailAbort.current?.abort()
    const ctrl = new AbortController()
    detailAbort.current = ctrl
    setChainDetailLoading(true)
    setChainDetailError(null)

    getChainState(selectedChainSlug, { signal: ctrl.signal })
      .then(data => {
        if (!ctrl.signal.aborted) {
          setChainDetail(data.found ? data : null)
          if (!data.found) setChainDetailError(data.error ?? 'Chain not found.')
          setChainDetailLoading(false)
        }
      })
      .catch((err: Error) => {
        if (err.name !== 'AbortError') {
          setChainDetailError(err.message)
          setChainDetailLoading(false)
        }
      })

    return () => ctrl.abort()
  }, [selectedChainSlug])

  // Filter chain results by statusFilter client-side (same logic as planning dash)
  const visibleChainResults = (() => {
    if (!chainResults) return null
    if (statusFilter === 'all') return chainResults
    const slugSet = new Set(
      applyVisibleChains(allChains, statusFilter, 'updated-desc' as ChainSortMode, null)
        .map(c => c.slug),
    )
    return chainResults.filter(r => slugSet.has(r.slug))
  })()

  const chainCount = visibleChainResults?.length ?? 0
  const taskCount = taskResults?.length ?? 0
  const countLabel = debouncedQuery.trim()
    ? `${chainCount} chain${chainCount !== 1 ? 's' : ''} · ${taskCount} task${taskCount !== 1 ? 's' : ''}`
    : 'Type to search'

  function handleSelectChain(slug: string) {
    setSelectedChainSlug(slug)
    setSelectedTaskMatch(null)
    setDetailMode('chain')
  }

  function handleSelectTask(match: TaskContentMatch) {
    setSelectedChainSlug(match.chain_slug)
    setSelectedTaskMatch(match)
    setDetailMode('task')
  }

  function handleGoToPlanning() {
    if (!selectedChainSlug) return
    const params = new URLSearchParams({ chain: selectedChainSlug })
    if (detailMode === 'task' && selectedTaskMatch) {
      params.set('task', selectedTaskMatch.task_slug)
    }
    navigate(`/tasks/chains?${params.toString()}`)
  }

  const hasSelection = selectedChainSlug !== null

  return (
    <div className={styles.page}>
      {/* Big search input */}
      <div className={styles.searchSection}>
        <input
          data-testid="work-search-input"
          className={styles.searchInput}
          type="search"
          placeholder="Search chains and tasks…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          aria-label="Search chains and tasks"
          autoFocus
        />
      </div>

      {/* Controls bar — no sort (results ranked by relevance) */}
      <ControlsBar
        onRefresh={() => setTick(t => t + 1)}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        countLabel={countLabel}
        loading={chainsLoading || tasksLoading}
        error={chainsError ?? tasksError}
      />

      {/* Three-column results grid */}
      <div className={styles.grid}>
        {/* Chain results */}
        <Panel title="Chains">
          {!debouncedQuery.trim() ? (
            <p className={styles.placeholder}>Enter a search term above.</p>
          ) : chainsLoading ? (
            <p className={styles.placeholder}>Searching…</p>
          ) : !visibleChainResults || visibleChainResults.length === 0 ? (
            <p className={styles.placeholder}>No chains found.</p>
          ) : (
            <ul className={styles.resultList}>
              {visibleChainResults.map(c => (
                <li
                  key={c.slug}
                  data-testid="chain-result"
                  data-chain-slug={c.slug}
                  className={`${styles.resultItem} ${selectedChainSlug === c.slug && detailMode === 'chain' ? styles.resultItemSelected : ''}`}
                  onClick={() => handleSelectChain(c.slug)}
                >
                  <div className={styles.chainResultTop}>
                    <span className={styles.chainResultSlug}>{c.slug}</span>
                    <span className={styles.chainResultProgress}>
                      {c.tasks_closed}/{c.tasks_total}
                    </span>
                  </div>
                  <div className={styles.chainResultMeta}>
                    <span className={styles.chainResultStatus}>{c.status}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Task results */}
        <Panel title="Tasks">
          {!debouncedQuery.trim() ? (
            <p className={styles.placeholder}>Enter a search term above.</p>
          ) : tasksLoading ? (
            <p className={styles.placeholder}>Searching…</p>
          ) : !taskResults || taskResults.length === 0 ? (
            <p className={styles.placeholder}>No tasks found.</p>
          ) : (
            <ul className={styles.resultList}>
              {taskResults.map((m, i) => (
                <li
                  key={`${m.chain_slug}-${m.task_slug}-${m.field}-${i}`}
                  data-testid="task-result"
                  className={`${styles.resultItem} ${selectedTaskMatch?.task_slug === m.task_slug && selectedTaskMatch?.chain_slug === m.chain_slug ? styles.resultItemSelected : ''}`}
                  onClick={() => handleSelectTask(m)}
                >
                  <div className={styles.taskResultMeta}>
                    <span className={styles.taskResultSlug} data-testid="task-result-slug">{m.task_slug}</span>
                    <span className={styles.taskResultChain} data-testid="task-result-chain">{m.chain_slug}</span>
                    <span className={styles.taskResultField} data-testid="task-result-field">{m.field}</span>
                    <StatusBadge status={m.task_status} variant="chip" />
                  </div>
                  <p className={styles.taskResultSnippet} data-testid="task-result-snippet">
                    {highlightSnippet(m.snippet, query).map((seg, j) =>
                      seg.highlighted
                        ? <mark key={j} className={styles.taskResultHighlight}>{seg.text}</mark>
                        : <span key={j}>{seg.text}</span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Detail panel */}
        <Panel
          title="Details"
          header={
            <div className={styles.toggleGroup} role="group" aria-label="Detail mode">
              {(['chain', 'task'] as DetailMode[]).map(m => (
                <button
                  key={m}
                  data-testid={`detail-toggle-${m}`}
                  aria-pressed={detailMode === m}
                  className={`${styles.toggleBtn} ${detailMode === m ? styles.toggleBtnActive : ''}`}
                  onClick={() => setDetailMode(m)}
                >
                  {m === 'task' ? 'Task' : 'Chain'}
                </button>
              ))}
            </div>
          }
        >
          {!hasSelection ? (
            <p className={styles.placeholder}>Click a chain or task result to see details.</p>
          ) : detailMode === 'chain' ? (
            <ChainDetailView
              chainDetail={chainDetail}
              loading={chainDetailLoading}
              error={chainDetailError}
              chainSummary={allChains.find(c => c.slug === selectedChainSlug) ?? null}
              onGo={handleGoToPlanning}
            />
          ) : selectedTaskMatch ? (
            <TaskDetail
              taskSlug={selectedTaskMatch.task_slug}
              taskStatus={selectedTaskMatch.task_status}
              chainSlug={selectedTaskMatch.chain_slug}
              field={selectedTaskMatch.field}
              snippet={selectedTaskMatch.snippet}
              highlightQuery={query}
              problemStatement={chainDetail?.tasks.find(t => t.slug === selectedTaskMatch.task_slug)?.problem_statement}
              onGoToPlanning={handleGoToPlanning}
            />
          ) : (
            <p className={styles.placeholder}>No task selected.</p>
          )}
        </Panel>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Detail views
// ---------------------------------------------------------------------------

function ChainDetailView({
  chainDetail, loading, error, chainSummary, onGo,
}: {
  chainDetail: ChainStateResponse | null
  loading: boolean
  error: string | null
  chainSummary: ChainSummary | null
  onGo: () => void
}) {
  if (loading) return <p className={styles.placeholder}>Loading chain…</p>
  if (error) return <p className={styles.placeholder}>{error}</p>
  if (!chainDetail) return <p className={styles.placeholder}>No chain data.</p>

  const counts = countByStatus(chainDetail.tasks)
  // design_decisions retired in migration 065 (Phase 4 F2).
  const hasProse =
    chainDetail.completion_condition.trim() ||
    chainDetail.output.trim()

  return (
    <div className={styles.detailBody}>
      <div data-testid="detail-chain-counts" className={styles.countStrip}>
        {([
          ['total', chainDetail.tasks.length],
          ['pending', counts['pending'] ?? 0],
          ['active', counts['active'] ?? 0],
          ['closed', counts['closed'] ?? 0],
          ['cancelled', counts['cancelled'] ?? 0],
        ] as [string, number][]).map(([label, n]) => (
          <span key={label} className={styles.countChip}>
            <span className={styles.countLabel}>{label}</span>
            <span className={styles.countValue}>{n}</span>
          </span>
        ))}
      </div>

      {chainSummary && (
        <div className={styles.metaStrip}>
          Updated {formatUpdatedAt(chainSummary.updated_at)}
        </div>
      )}

      {!hasProse && (
        <p className={styles.emptyProseNote}>No prose fields recorded for this chain.</p>
      )}

      {chainDetail.completion_condition.trim() && (
        <ProseSectionW title="Completion condition" body={chainDetail.completion_condition} />
      )}
      {chainDetail.output.trim() && (
        <ProseSectionW title="Output" body={chainDetail.output} />
      )}

      <button
        data-testid="go-to-planning"
        className={styles.goBtn}
        onClick={onGo}
      >
        Go to planning dash →
      </button>
    </div>
  )
}

function ProseSectionW({ title, body }: { title: string; body: string }) {
  return (
    <div className={styles.proseSection}>
      <h4 className={styles.proseSectionTitle}>{title}</h4>
      <p className={styles.proseSectionBody}>{body}</p>
    </div>
  )
}
