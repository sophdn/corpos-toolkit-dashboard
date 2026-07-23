import { useEffect, useMemo, useRef, useState } from 'react'
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'

import { getBenchmarkTasks } from '../../api/benchmarks'
import {
  ALL_TASK_SHAPES,
  AXES_BY_SHAPE,
  type ModelMetrics,
  type RadarAxis,
  type TaskShape,
} from '../../lib/benchmarkCards'
import { colorForModel } from '../../lib/benchmarkColors'
import {
  type BenchmarkTasksResponse,
  type SmokeVerdict,
  type TaskCard,
  formatTaskTitle,
} from '../../lib/benchmarkTasks'
import styles from './Benchmarks.module.css'

// Per chain `benchmarks-page-per-task-redesign` T3: one card per
// discrete offload task. Replaces the prior shape grid + rubric grid
// surfaces. Shape is a tag on each card; verdict is a tag for tasks
// tied to a rubric_lib registry entry. Multi-model overlay per card
// answers "which model performs each task best?" once benchmark data
// covers more than one model.

export function BenchmarksPage() {
  const [tasks, setTasks] = useState<BenchmarkTasksResponse>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hiddenModels, setHiddenModels] = useState<Set<string>>(new Set())
  /** Shapes toggled OFF by the shape filter. */
  const [hiddenShapes, setHiddenShapes] = useState<Set<TaskShape>>(new Set())

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

  /** Unique model names across all tasks, alphabetically sorted. */
  const allModels = useMemo(() => {
    const set = new Set<string>()
    for (const t of tasks) {
      for (const m of t.models) set.add(m.model_name)
    }
    return [...set].sort()
  }, [tasks])

  function toggleModel(model: string) {
    setHiddenModels((prev) => {
      const next = new Set(prev)
      if (next.has(model)) next.delete(model)
      else next.add(model)
      return next
    })
  }

  function toggleShape(shape: TaskShape) {
    setHiddenShapes((prev) => {
      const next = new Set(prev)
      if (next.has(shape)) next.delete(shape)
      else next.add(shape)
      return next
    })
  }

  /** Deployable tasks render as polygon cards in the grid. Non-deployable
   * tasks live on /deferred-ports — out of scope here. */
  const deployableTasks = useMemo(
    () => tasks.filter((t) => t.deployable),
    [tasks],
  )

  /** Deployable tasks filtered by shape pills. Model filter applies
   * inside cards. */
  const visibleTasks = useMemo(() => {
    if (hiddenShapes.size === 0) return deployableTasks
    return deployableTasks.filter((t) => !hiddenShapes.has(t.task_shape))
  }, [deployableTasks, hiddenShapes])

  const visibleModelCount = allModels.length - hiddenModels.size
  const taskCount = deployableTasks.length
  const visibleTaskCount = visibleTasks.length

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Local LLM Task Performance</h1>
        <span className={styles.subtitle} data-testid="benchmarks-summary">
          {visibleModelCount} of {allModels.length} model
          {allModels.length === 1 ? '' : 's'} across {visibleTaskCount} of{' '}
          {taskCount} task
          {taskCount === 1 ? '' : 's'}
        </span>
      </div>

      {!loading && !error && (
        <div className={styles.modelFilter} data-testid="shape-filter">
          <span className={styles.modelFilterLabel}>Shapes:</span>
          {ALL_TASK_SHAPES.map((shape) => {
            const hidden = hiddenShapes.has(shape)
            return (
              <button
                key={shape}
                type="button"
                className={`${styles.modelFilterPill} ${hidden ? styles.modelFilterPillMuted : ''}`}
                onClick={() => toggleShape(shape)}
                aria-pressed={!hidden}
                data-testid={`shape-filter-${shape}`}
              >
                {shape}
              </button>
            )
          })}
        </div>
      )}

      {!loading && !error && allModels.length > 0 && (
        <div className={styles.modelFilter} data-testid="model-filter">
          <span className={styles.modelFilterLabel}>Models:</span>
          {allModels.map((model) => {
            const hidden = hiddenModels.has(model)
            const color = colorForModel(model)
            return (
              <button
                key={model}
                type="button"
                className={`${styles.modelFilterPill} ${hidden ? styles.modelFilterPillMuted : ''}`}
                onClick={() => toggleModel(model)}
                aria-pressed={!hidden}
                data-testid={`model-filter-${model}`}
              >
                <span
                  className={styles.legendSwatch}
                  style={{ background: color }}
                />
                {model}
              </button>
            )
          })}
        </div>
      )}

      {loading && <div className={styles.state}>Loading…</div>}
      {error && <div className={styles.state}>{error}</div>}

      {!loading && !error && (
        <div className={styles.grid} data-testid="tasks-grid">
          {visibleTasks.map((task) => (
            <TaskCardView
              key={task.task_id}
              task={task}
              hiddenModels={hiddenModels}
            />
          ))}
        </div>
      )}

      <div className={styles.footer}>
        Each card aggregates the most recent 50 runs per task × model.
        Latency and Tokens are normalized per-task relative-to-slowest.
        See{' '}
        <code>~/.claude/vault/decisions/2026-05-10_extract-now-rubric-foundation.md</code>{' '}
        for the per-task taxonomy.
      </div>
    </div>
  )
}

// ── Per-card subcomponent ────────────────────────────────────────────────

interface TaskCardViewProps {
  task: TaskCard
  hiddenModels: Set<string>
}

function TaskCardView({ task, hiddenModels }: TaskCardViewProps) {
  // Each task picks its axis set from its task_shape. The 4 shape
  // axis sets in AXES_BY_SHAPE already cover every task the
  // /benchmarks/tasks endpoint emits. `task_shape` is typed as the
  // closed TaskShape union, but the backend column is free-text — guard
  // against a shape outside the set so one malformed row renders an
  // empty card instead of white-screening the whole page.
  const axes: RadarAxis[] | undefined = AXES_BY_SHAPE[task.task_shape]
  const visibleModels = task.models.filter(
    (m) => !hiddenModels.has(m.model_name),
  )

  const data = (axes ?? []).map((axis) => {
    const row: Record<string, string | number> = { axis: axis.label }
    for (const m of visibleModels) {
      const v = readAxis(m, axis)
      row[m.model_name] = v ?? 0
    }
    return row
  })

  const isEmpty = task.models.length === 0
  const allHidden = !isEmpty && visibleModels.length === 0
  const title = formatTaskTitle(task.task_id)

  return (
    <div className={styles.card} data-testid={`task-card-${task.task_id}`}>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>{title}</h2>
        <span className={styles.cardSubtitle}>
          <span data-testid={`task-card-${task.task_id}-shape`}>
            {task.task_shape}
          </span>
          {task.verdict ? (
            <>
              {' · '}
              <span data-testid={`task-card-${task.task_id}-verdict`}>
                {verdictBadge(task.verdict)}
              </span>
            </>
          ) : null}
        </span>
      </div>

      {!task.deployable ? (
        <div
          className={styles.cardEmpty}
          data-testid={`task-card-${task.task_id}-non-deployable`}
        >
          <strong>{task.verdict_note}</strong>
          {task.retrigger_condition ? (
            <>
              <br />
              <span>Retrigger: {task.retrigger_condition}</span>
            </>
          ) : null}
        </div>
      ) : !axes ? (
        <div
          className={styles.cardEmpty}
          data-testid={`task-card-${task.task_id}-unknown-shape`}
        >
          Unknown task shape “{task.task_shape}” — no radar axes defined.
        </div>
      ) : isEmpty ? (
        <div className={styles.cardEmpty}>
          No runs tagged with this task yet — run a benchmark or deploy
          to populate.
        </div>
      ) : allHidden ? (
        <div className={styles.cardEmpty}>
          All {title} models hidden by the filter above.
        </div>
      ) : (
        <>
          <div className={styles.radarWrap}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={data} outerRadius="75%">
                <PolarGrid />
                <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11 }} />
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 1]}
                  tick={false}
                  axisLine={false}
                />
                <Tooltip
                  formatter={(value, name) => {
                    const v = typeof value === 'number' ? value : Number(value)
                    const modelName =
                      typeof name === 'string' ? name : String(name ?? '')
                    if (Number.isNaN(v)) {
                      return [String(value ?? ''), modelName]
                    }
                    const m = task.models.find(
                      (x) => x.model_name === modelName,
                    )
                    if (!m) return [v.toFixed(2), modelName]
                    return [formatScore(v, m), modelName]
                  }}
                  labelFormatter={(label) =>
                    typeof label === 'string' ? label : String(label ?? '')
                  }
                />
                {visibleModels.map((m) => {
                  const color = colorForModel(m.model_name)
                  return (
                    <Radar
                      key={m.model_name}
                      name={m.model_name}
                      dataKey={m.model_name}
                      stroke={color}
                      fill={color}
                      fillOpacity={0.18}
                      strokeWidth={1.5}
                    />
                  )
                })}
              </RadarChart>
            </ResponsiveContainer>
          </div>

          <div className={styles.cardLegend}>
            {task.models.map((m) => {
              const hidden = hiddenModels.has(m.model_name)
              const color = colorForModel(m.model_name)
              return (
                <span
                  key={m.model_name}
                  className={`${styles.legendItem} ${hidden ? styles.legendItemMuted : ''}`}
                  data-testid={`task-card-${task.task_id}-legend-${m.model_name}`}
                >
                  <span
                    className={styles.legendSwatch}
                    style={{ background: color }}
                  />
                  {m.model_name}
                  <span className={styles.cardSubtitle}>
                    · n={m.n_runs}
                  </span>
                </span>
              )
            })}
          </div>

          <VerdictHistogram task={task} models={visibleModels} />
        </>
      )}
    </div>
  )
}

// ── Verdict histogram ────────────────────────────────────────────────────
//
// Aggregates per-(model) `verdict_distribution` across the card's
// visible models into a single label→count map, then renders one bar
// per label sized by share of total. The diagnostic value of this view
// is the proportion, not the absolute count: e.g. a high `unclear`
// share on chain-assessment signals thin team-context derivation.

interface VerdictHistogramProps {
  task: TaskCard
  models: ModelMetrics[]
}

function VerdictHistogram({ task, models }: VerdictHistogramProps) {
  const merged = aggregateVerdictDistribution(models)
  if (!merged) return null
  const total = Object.values(merged).reduce((acc, n) => acc + n, 0)
  if (total === 0) return null
  const entries = Object.entries(merged).sort((a, b) => b[1] - a[1])
  return (
    <div
      className={styles.verdictHist}
      data-testid={`task-card-${task.task_id}-verdicts`}
    >
      {entries.map(([label, count]) => {
        const pct = (count / total) * 100
        return (
          <div
            key={label}
            className={styles.verdictRow}
            data-testid={`task-card-${task.task_id}-verdict-${label}`}
          >
            <span className={styles.verdictLabel}>{label}</span>
            <div className={styles.verdictBar}>
              <div
                className={styles.verdictBarFill}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className={styles.verdictCount}>
              {count} ({pct.toFixed(0)}%)
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** Sum verdict counts across models. Returns null when no model in
 * `models` reported a `verdict_distribution` (legacy tasks, Summarize-
 * shape tasks without a Classify label, or freshly seeded tasks before
 * the field was populated). */
function aggregateVerdictDistribution(
  models: ModelMetrics[],
): Record<string, number> | null {
  const merged: Record<string, number> = {}
  let any = false
  for (const m of models) {
    if (!m.verdict_distribution) continue
    any = true
    for (const [label, count] of Object.entries(m.verdict_distribution)) {
      merged[label] = (merged[label] ?? 0) + count
    }
  }
  return any ? merged : null
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

/** Read a model's value for an axis. Returns null when the field is null. */
function readAxis(m: ModelMetrics, axis: RadarAxis): number | null {
  switch (axis.field) {
    case 'accuracy':
      return m.accuracy
    case 'honesty':
      return m.honesty
    case 'ranking_quality':
      return m.ranking_quality
    case 'within_budget':
      return m.within_budget
    case 'latency_normalized':
      return m.latency_normalized
    case 'tokens_normalized':
      return m.tokens_normalized
  }
}

/** Tooltip-friendly score formatting. Includes raw values for latency/tokens. */
function formatScore(value: number, m: ModelMetrics): string {
  if (Math.abs(value - m.latency_normalized) < 1e-9) {
    return `${value.toFixed(2)} (${m.latency_median_ms} ms)`
  }
  if (Math.abs(value - m.tokens_normalized) < 1e-9) {
    return `${value.toFixed(2)} (${m.tokens_median_total} tokens)`
  }
  return value.toFixed(2)
}
