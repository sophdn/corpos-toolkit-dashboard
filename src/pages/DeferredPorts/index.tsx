import { useEffect, useRef, useState } from 'react'

import { getBenchmarkTasks } from '../../api/benchmarks'
import {
  type BenchmarkTasksResponse,
  type SmokeVerdict,
  formatTaskTitle,
} from '../../lib/benchmarkTasks'
import benchmarksStyles from '../Benchmarks/Benchmarks.module.css'

// Deferred / rejected ports — sister page to /benchmarks
// (Local LLM Task Performance). Surfaces rubric ports that smoked
// but are not yet dispatchable, with the observable signal that
// would unlock re-evaluation. Sourced from the same /benchmarks/tasks
// endpoint, filtered to !deployable.

export function DeferredPortsPage() {
  const [tasks, setTasks] = useState<BenchmarkTasksResponse>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    setError(null)

    getBenchmarkTasks({ signal: ctrl.signal })
      .then((data) => {
        if (ctrl.signal.aborted) return
        setTasks(data)
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

  const nonDeployable = tasks.filter((t) => !t.deployable)

  return (
    <div className={benchmarksStyles.page}>
      <div className={benchmarksStyles.header}>
        <h1 className={benchmarksStyles.title}>Deferred Ports</h1>
        <span className={benchmarksStyles.subtitle}>
          {nonDeployable.length} smoke-validated rubric port
          {nonDeployable.length === 1 ? '' : 's'} not yet dispatchable
        </span>
      </div>

      <div className={benchmarksStyles.subtitle}>
        Each row carries the smoke verdict and the observable signal
        that would unlock re-evaluation. When a retrigger condition
        fires, the port moves back onto the active grid at /benchmarks.
      </div>

      {loading && <div className={benchmarksStyles.state}>Loading…</div>}
      {error && <div className={benchmarksStyles.state}>{error}</div>}

      {!loading && !error && nonDeployable.length === 0 && (
        <div className={benchmarksStyles.state}>
          No deferred or rejected ports — every smoked rubric is
          dispatchable.
        </div>
      )}

      {!loading && !error && nonDeployable.length > 0 && (
        <ul
          className={benchmarksStyles.deferredList}
          data-testid="deferred-ports-list"
        >
          {nonDeployable.map((task) => (
            <li
              key={task.task_id}
              className={benchmarksStyles.deferredItem}
              data-testid={`deferred-port-${task.task_id}`}
            >
              <div className={benchmarksStyles.deferredItemHeader}>
                <strong>{formatTaskTitle(task.task_id)}</strong>
                <span className={benchmarksStyles.cardSubtitle}>
                  {task.task_shape}
                  {task.verdict ? ` · ${verdictBadge(task.verdict)}` : null}
                </span>
              </div>
              {task.verdict_note ? (
                <div className={benchmarksStyles.deferredItemNote}>
                  {task.verdict_note}
                </div>
              ) : null}
              {task.retrigger_condition ? (
                <div className={benchmarksStyles.deferredItemRetrigger}>
                  Retrigger: {task.retrigger_condition}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function verdictBadge(verdict: SmokeVerdict): string {
  switch (verdict) {
    case 'ExtractNowWithQwenDispatch':
      return 'extract-now'
    case 'ExtractNowKeepClaudeClassification':
      return 'extract (Claude)'
    case 'RejectedRubricTooSoftForQwen':
      return 'rejected'
    case 'DeferredWithTrigger':
      return 'deferred'
  }
}
