import { useEffect, useRef, useState } from 'react'
import { get } from '../../lib/http'
import { formatRelativeTime } from '../../lib/relativeTime'
import { useProject } from '../../hooks/useProject'
import {
  getInferenceHealthCards,
  getInferenceRetrievalHealth,
  getInferenceSparklines,
  staleTierForLastCall,
  type HealthCard,
  type RetrievalHealthAction,
  type Sparkline,
  type SparklineBucket,
} from '../../api/inference'
import styles from './Inference.module.css'

// /inference page. Chain telemetry-substrate-cleanup T3 (T3a backend +
// T3b page + T3c retrieval-health panel + T3d v1 retirement). Answers
// four distinct questions a liveness-only page cannot:
//
//   is it alive?      → last_call_at + stale-threshold tinting
//   is it healthy?    → p50/p95/p99 latency + success_rate
//   is it improving?  → 7d sparklines for p95 + success_rate
//   is it costly?     → tokens_per_day + per-model breakdown
//
// Warmup-period UI states (per vault learning
// 2026-05-12_telemetry-history-warmup-period): server marks signals
// without enough history as warming_up: true and returns the scalar as
// null. This page renders an explicit "warming up" badge for each such
// cell rather than silently degrading to a fallback.

type WindowChoice = '7' | '30' | '90'

interface BugStub {
  slug: string
  title: string
  status: string
  qwen_task_id: string | null
}

export function InferencePage() {
  const [project] = useProject()
  const [windowDays, setWindowDays] = useState<WindowChoice>('7')
  const [cards, setCards] = useState<HealthCard[]>([])
  const [bugsByTask, setBugsByTask] = useState<Record<string, BugStub[]>>({})
  const [retrieval, setRetrieval] = useState<RetrievalHealthAction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    setError(null)

    const wd = Number(windowDays)
    const cardsPromise = getInferenceHealthCards({
      signal: ctrl.signal,
      project: project ?? undefined,
      window_days: wd,
    })
    const bugsPath = project
      ? `/bugs?project=${encodeURIComponent(project)}`
      : '/bugs'
    const bugsPromise = get<BugStub[]>(bugsPath, ctrl.signal)
    // Retrieval-health is "best-effort" — failure shouldn't block the
    // primary page render (the panel just hides). Catch the error
    // inside the promise so it doesn't bubble into the page-level
    // setError. Same shape we'd use if the projections weren't
    // populated yet — degrades gracefully per the chain T3 acceptance
    // criteria.
    const retrievalPromise = getInferenceRetrievalHealth({
      signal: ctrl.signal,
      project: project ?? undefined,
      window_days: wd,
    }).catch(() => [] as RetrievalHealthAction[])
    // Per-tool-per-model ranking moved to its own page (/telemetry/model-ranking,
    // chain telemetry-page-ia-unification) — the Inference page is per-task health.

    Promise.all([cardsPromise, bugsPromise, retrievalPromise])
      .then(([cardsRes, bugsRes, retrievalRes]) => {
        if (ctrl.signal.aborted) return
        setCards(cardsRes)
        const grouped: Record<string, BugStub[]> = {}
        for (const b of bugsRes) {
          if (b.qwen_task_id) {
            ;(grouped[b.qwen_task_id] ??= []).push(b)
          }
        }
        setBugsByTask(grouped)
        setRetrieval(retrievalRes)
        setLoading(false)
      })
      .catch((err: Error) => {
        if (err.name !== 'AbortError') {
          setError(err.message)
          setLoading(false)
        }
      })

    return () => ctrl.abort()
  }, [project, windowDays])

  if (loading) return <div className={styles.empty}>Loading…</div>
  if (error) return <div className={styles.error}>{error}</div>

  return (
    <div className={styles.page} data-testid="inference-page">
      <div className={styles.header}>
        <h1 className={styles.heading}>Inference</h1>
        <div className={styles.controls}>
          <label className={styles.controlLabel} htmlFor="inference-window">
            Window
          </label>
          <select
            id="inference-window"
            className={styles.windowSelect}
            value={windowDays}
            onChange={(e) => setWindowDays(e.target.value as WindowChoice)}
            data-testid="inference-window"
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
        </div>
      </div>

      <ModelSummary cards={cards} />

      <RetrievalHealthPanel data={retrieval} />

      {cards.length === 0 ? (
        <div className={styles.empty}>No inference calls recorded in this window.</div>
      ) : (
        <table className={styles.table} data-testid="inference-table">
          <thead>
            <tr>
              <th>Task</th>
              <th>Last call</th>
              <th>p50</th>
              <th>p95</th>
              <th>p99</th>
              <th>Success%</th>
              <th>Bugs</th>
              <th>Tokens/day</th>
            </tr>
          </thead>
          <tbody>
            {cards.map((c) => (
              <TaskRow
                key={c.task_id}
                card={c}
                bugs={bugsByTask[c.task_id] ?? []}
                windowDays={Number(windowDays)}
                project={project ?? undefined}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

/**
 * Per-model summary card at top — 7d (or window-relative) token totals
 * by model. Helps decide which task to retarget at a cheaper model.
 */
function ModelSummary({ cards }: { cards: HealthCard[] }) {
  const byModel = new Map<string, { calls: number; tokensApprox: number; tasks: Set<string> }>()
  for (const c of cards) {
    for (const m of c.model_breakdown) {
      const acc = byModel.get(m.model_name) ?? { calls: 0, tokensApprox: 0, tasks: new Set() }
      acc.calls += m.call_count
      // tokens_per_day is per-task; approximate per-model tokens by
      // splitting proportional to the model's share of this task's calls.
      if (c.tokens_per_day != null && c.call_count > 0) {
        acc.tokensApprox += (c.tokens_per_day * m.call_count) / c.call_count
      }
      acc.tasks.add(c.task_id)
      byModel.set(m.model_name, acc)
    }
  }
  if (byModel.size === 0) return null
  const rows = [...byModel.entries()].sort((a, b) => b[1].calls - a[1].calls)
  return (
    <div className={styles.modelSummary} data-testid="model-summary">
      <div className={styles.modelSummaryTitle}>Model totals (window)</div>
      <div className={styles.modelSummaryRows}>
        {rows.map(([model, acc]) => (
          <div key={model} className={styles.modelSummaryRow}>
            <span className={styles.modelName}>{model}</span>
            <span className={styles.modelStat}>{acc.calls.toLocaleString()} calls</span>
            <span className={styles.modelStat}>
              ~{Math.round(acc.tokensApprox).toLocaleString()} tokens/day
            </span>
            <span className={styles.modelTasks}>
              across {acc.tasks.size} task{acc.tasks.size === 1 ? '' : 's'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function TaskRow({
  card,
  bugs,
  windowDays,
  project,
}: {
  card: HealthCard
  bugs: BugStub[]
  windowDays: number
  project: string | undefined
}) {
  const [open, setOpen] = useState(false)
  const [sparkline, setSparkline] = useState<Sparkline | null>(null)
  const [sparklineErr, setSparklineErr] = useState<string | null>(null)
  const hasBugs = bugs.length > 0
  const tier = staleTierForLastCall(card.last_call_at)
  const showSparkline = open && !card.warming_up.sparklines

  useEffect(() => {
    if (!showSparkline || sparkline) return
    let cancelled = false
    getInferenceSparklines({
      task_id: card.task_id,
      window_days: windowDays,
      project,
    })
      .then((data) => {
        if (cancelled) return
        setSparkline(data[0] ?? { task_id: card.task_id, buckets: [] })
      })
      .catch((err: Error) => {
        if (!cancelled) setSparklineErr(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [showSparkline, card.task_id, windowDays, project, sparkline])

  return (
    <>
      <tr
        data-testid={`inference-row-${card.task_id}`}
        onClick={() => setOpen((o) => !o)}
        className={styles.taskRow}
      >
        <td>
          <span className={styles.taskId}>{card.task_id}</span>
        </td>
        <td>
          <span className={`${styles.staleCell} ${styles[`stale-${tier}`]}`} data-testid={`stale-${card.task_id}`}>
            {formatRelativeTime(card.last_call_at)}
          </span>
        </td>
        <td>{formatMs(card.p50_latency_ms)}</td>
        <td>{formatMs(card.p95_latency_ms)}</td>
        <td>
          {card.p99_latency_ms != null
            ? `${card.p99_latency_ms} ms`
            : card.warming_up.p99
              ? <WarmingUpBadge label="p99" />
              : '—'}
        </td>
        <td>
          {card.success_rate != null
            ? `${(card.success_rate * 100).toFixed(0)}%`
            : card.warming_up.success_rate
              ? <WarmingUpBadge label="success" />
              : '—'}
        </td>
        <td>
          {hasBugs ? (
            <span className={styles.bugCount}>{bugs.length}</span>
          ) : (
            <span className={styles.bugCountZero}>—</span>
          )}
        </td>
        <td>
          {card.tokens_per_day != null ? card.tokens_per_day.toLocaleString() : '—'}
        </td>
      </tr>
      {open && (
        <tr className={styles.expandRow}>
          <td colSpan={8} className={styles.expandCell}>
            <div className={styles.expand}>
              <div className={styles.expandSection}>
                <div className={styles.expandLabel}>Success predicate</div>
                <div className={styles.expandValue}>{card.success_rate_basis}</div>
              </div>
              <div className={styles.expandSection}>
                <div className={styles.expandLabel}>Models</div>
                <div className={styles.expandValue}>
                  {card.model_breakdown.map((m) => (
                    <span key={m.model_name} className={styles.modelChip}>
                      {m.model_name}: {m.call_count} call{m.call_count === 1 ? '' : 's'} (p95 {m.p95_latency_ms} ms)
                    </span>
                  ))}
                </div>
              </div>
              {card.warming_up.sparklines ? (
                <div className={styles.expandSection}>
                  <WarmingUpBadge label="sparklines (need ≥3 days of data)" />
                </div>
              ) : sparklineErr ? (
                <div className={styles.expandSection}>
                  <div className={styles.expandError}>Sparkline load failed: {sparklineErr}</div>
                </div>
              ) : sparkline ? (
                <SparklineBlock buckets={sparkline.buckets} />
              ) : (
                <div className={styles.expandSection}>Loading sparkline…</div>
              )}
              {hasBugs && (
                <div className={styles.expandSection}>
                  <div className={styles.expandLabel}>Linked bugs</div>
                  <ul className={styles.bugsList} data-testid={`bug-list-${card.task_id}`}>
                    {bugs.map((b) => (
                      <li key={b.slug}>
                        {b.title}
                        <span className={styles.bugSlug}> ({b.slug})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function SparklineBlock({ buckets }: { buckets: SparklineBucket[] }) {
  if (buckets.length === 0) {
    return <div className={styles.expandSection}>No daily activity in window.</div>
  }
  // Two side-by-side mini-charts: p95 latency and success rate. Pure
  // inline-CSS bars for now; the chain T3 spec defers Playwright /
  // Recharts integration to a follow-on if the inline shape proves
  // limiting.
  const maxP95 = Math.max(
    ...buckets.map((b) => (b.p95_latency_ms ?? 0)),
    1,
  )
  return (
    <div className={styles.sparklineRow}>
      <div className={styles.sparklineCol} data-testid="sparkline-p95">
        <div className={styles.sparklineTitle}>p95 latency</div>
        <div className={styles.bars}>
          {buckets.map((b) => (
            <div key={b.date} className={styles.barCol} title={`${b.date}: ${b.p95_latency_ms ?? 'n/a'} ms (${b.call_count} calls)`}>
              <div
                className={`${styles.bar} ${b.p95_latency_ms == null ? styles.barGap : ''}`}
                style={{
                  height: b.p95_latency_ms != null
                    ? `${Math.max(4, (b.p95_latency_ms / maxP95) * 60)}px`
                    : '4px',
                }}
              />
              <div className={styles.barDate}>{b.date.slice(5)}</div>
            </div>
          ))}
        </div>
      </div>
      <div className={styles.sparklineCol} data-testid="sparkline-success">
        <div className={styles.sparklineTitle}>success rate</div>
        <div className={styles.bars}>
          {buckets.map((b) => (
            <div key={b.date} className={styles.barCol} title={`${b.date}: ${b.success_rate == null ? 'n/a' : (b.success_rate * 100).toFixed(0) + '%'} (${b.call_count} calls)`}>
              <div
                className={`${styles.bar} ${b.success_rate == null ? styles.barGap : ''}`}
                style={{
                  height: b.success_rate != null
                    ? `${Math.max(4, b.success_rate * 60)}px`
                    : '4px',
                }}
              />
              <div className={styles.barDate}>{b.date.slice(5)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * Retrieval-health panel — chain telemetry-substrate-cleanup T3c.
 * For tasks that emit grounding_events (vault_search / kiwix_search /
 * knowledge_search), surfaces per-tier click_kind rates plus a weighted
 * aggregate score from query_interactions. Hides entirely when the
 * substrate isn't populated (empty array from the endpoint).
 *
 * Tiered per vault learning
 * 2026-05-17_tiered-implicit-feedback-for-rag-telemetry: separate
 * per-kind rates (followed / cited / mentioned / resolved-from) AND a
 * weighted aggregate, NOT a flat "any click" rate that would collapse
 * the tiering the substrate was designed to preserve.
 */
function RetrievalHealthPanel({ data }: { data: RetrievalHealthAction[] }) {
  if (data.length === 0) return null
  return (
    <div className={styles.retrievalPanel} data-testid="retrieval-health-panel">
      <div className={styles.retrievalPanelHeader}>
        <div className={styles.retrievalPanelTitle}>Retrieval feedback (tiered)</div>
        <div className={styles.retrievalPanelSubtitle}>
          per-tier click rates + weighted aggregate, from query_interactions
        </div>
      </div>
      <div className={styles.retrievalRows}>
        {data.map((a) => (
          <RetrievalHealthRow key={a.action} action={a} />
        ))}
      </div>
    </div>
  )
}

function RetrievalHealthRow({ action }: { action: RetrievalHealthAction }) {
  if (action.warming_up) {
    return (
      <div className={styles.retrievalRow} data-testid={`retrieval-row-${action.action}`}>
        <div className={styles.retrievalActionName}>{action.action}</div>
        <WarmingUpBadge label={`only ${action.grounding_count} searches`} />
      </div>
    )
  }
  return (
    <div className={styles.retrievalRow} data-testid={`retrieval-row-${action.action}`}>
      <div className={styles.retrievalActionName}>{action.action}</div>
      <div className={styles.retrievalKinds}>
        {action.by_kind.map((k) => (
          <div
            key={k.click_kind}
            className={styles.retrievalKindCell}
            data-testid={`retrieval-${action.action}-${k.click_kind}`}
            title={`${k.count} / ${action.grounding_count} searches; weight ${k.weight}`}
          >
            <span className={styles.retrievalKindName}>{k.click_kind}</span>
            <span className={styles.retrievalKindRate}>{(k.rate * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
      <div
        className={styles.retrievalWeightedScore}
        data-testid={`retrieval-${action.action}-weighted`}
        title="Σ(rate × weight); higher = stronger feedback signal per search"
      >
        <span className={styles.retrievalWeightedLabel}>weighted</span>
        <span className={styles.retrievalWeightedValue}>{action.weighted_score.toFixed(2)}</span>
      </div>
      <div className={styles.retrievalCounts}>
        {action.interaction_count} interactions · {action.grounding_count} searches
      </div>
    </div>
  )
}

function WarmingUpBadge({ label }: { label: string }) {
  return (
    <span className={styles.warmingUpBadge} data-testid="warming-up-badge" title="warming up — not enough data in window">
      warming up ({label})
    </span>
  )
}

function formatMs(ms: number | null): string {
  if (ms == null) return '—'
  return `${ms} ms`
}

