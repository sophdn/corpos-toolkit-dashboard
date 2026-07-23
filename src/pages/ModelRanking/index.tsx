import { useEffect, useRef, useState } from 'react'
import { useProject } from '../../hooks/useProject'
import {
  getInferenceToolModelPerformance,
  type ToolModelStat,
} from '../../api/inference'
import { formatRelativeTime } from '../../lib/relativeTime'
import styles from './ModelRanking.module.css'

// Model Ranking page — chain telemetry-page-ia-unification (Chain 4). Promotes
// the per-tool-per-model ranking (formerly an embedded panel on the Inference
// page) to a first-class page under the read-side TELEMETRY nav section. Reads
// the read-side projection proj_inference_tool_model_performance via
// /inference/tool-model-performance and ranks models within each tool by call
// volume (the server orders by task_id, then call_count desc). This is the
// side-by-side "HOW EACH MODEL performs for a given tool" view — the basis for
// the data-driven router's best-model-per-task decision, and the first place
// remote-Claude calls become visible as first-class rows.
//
// success_rate here is CALL-LEVEL (no error AND non-empty output), distinct from
// the Inference health cards' predicate-registry success_rate. The projection is
// cumulative (all-time), not window-scoped — so this page has no window selector.

export function ModelRankingPage() {
  const [project] = useProject()
  const [rows, setRows] = useState<ToolModelStat[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    setError(null)

    getInferenceToolModelPerformance({ signal: ctrl.signal, project: project ?? undefined })
      .then((res) => {
        if (ctrl.signal.aborted) return
        setRows(res)
        setLoading(false)
      })
      .catch((err: Error) => {
        if (err.name !== 'AbortError') {
          setError(err.message)
          setLoading(false)
        }
      })

    return () => ctrl.abort()
  }, [project])

  if (loading) return <div className={styles.empty}>Loading…</div>
  if (error) {
    return (
      <div className={styles.error} data-testid="model-ranking-error">
        {error}
      </div>
    )
  }

  return (
    <div className={styles.page} data-testid="model-ranking-page">
      <header className={styles.header}>
        <h2 className={styles.title}>Model Ranking</h2>
        <p className={styles.subtitle}>
          Call-level success, latency &amp; token cost by (tool, model) — cumulative across all time.
        </p>
      </header>

      {rows.length === 0 ? (
        <div className={styles.empty} data-testid="model-ranking-empty">
          No inference calls recorded yet. Rows appear once the
          inference_tool_model_performance projection is populated (one row per
          tool × model the router has invoked).
        </div>
      ) : (
        <table className={styles.table} data-testid="tool-model-table">
          <thead>
            <tr>
              <th>Tool</th>
              <th>Model</th>
              <th>Calls</th>
              <th>Success%</th>
              <th>Avg latency</th>
              <th>Max latency</th>
              <th>Avg tokens</th>
              <th>Last call</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s, i) => {
              // Show the tool name only on the first row of each group — the
              // server already clusters models under their tool.
              const firstOfGroup = i === 0 || rows[i - 1].task_id !== s.task_id
              return (
                <tr
                  key={`${s.task_id}|${s.model_name}`}
                  data-testid={`tool-model-row-${s.task_id}-${s.model_name}`}
                >
                  <td>{firstOfGroup ? <span className={styles.taskId}>{s.task_id}</span> : ''}</td>
                  <td>
                    <span className={styles.modelName}>{s.model_name}</span>
                  </td>
                  <td>{s.call_count.toLocaleString()}</td>
                  <td>{(s.success_rate * 100).toFixed(0)}%</td>
                  <td>{s.avg_latency_ms} ms</td>
                  <td>{s.max_latency_ms} ms</td>
                  <td>{s.avg_tokens != null ? Math.round(s.avg_tokens).toLocaleString() : '—'}</td>
                  <td>{formatRelativeTime(s.last_invoked_at)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
