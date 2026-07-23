import { useEffect, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { getMemorySubstrateStats } from '../../api/memorySubstrate'
import type {
  MemoryKindCount,
  MemoryRatePoint,
  MemorySubstrateStats,
} from '../../api/types.gen'
import styles from './MemorySubstrate.module.css'

/**
 * MemorySubstratePage renders telemetry for the vault-mediated memory
 * substrate (chain memory-substrate-within-vault T8): proj_memories +
 * MemoryWritten events. First-pass ahead of the telemetry-unification push
 * — favors a working, tested read of the real data over final information
 * architecture. DB-derived only; the vault-vs-harness-dir materialization
 * drift (the legacy-writer story) is being retired in chain
 * own-memory-read-then-disable-harness-auto-memory, not surfaced here.
 */
export function MemorySubstratePage() {
  const [data, setData] = useState<MemorySubstrateStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true)
    setError(null)
    getMemorySubstrateStats(ctrl.signal)
      .then((resp) => {
        setData(resp)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return
        setError(err instanceof Error ? err.message : 'unknown error')
        setLoading(false)
      })
    return () => ctrl.abort()
  }, [])

  return (
    <div className={styles.page} data-testid="memory-substrate-page">
      <header className={styles.header}>
        <h1 className={styles.title}>Memory Substrate</h1>
        <p className={styles.subtitle}>
          The vault-mediated memory organ (
          <code className={styles.metaNote}>proj_memories</code> +{' '}
          <code className={styles.metaNote}>MemoryWritten</code> events). Entries land via{' '}
          <code className={styles.metaNote}>forge(memory)</code> as
          vault/memory/&lt;kind&gt;/&lt;name&gt;.md, surface through parse_context, and
          materialize into the harness memory dir on session start.
        </p>
      </header>

      {loading && (
        <div className={styles.placeholder} data-testid="memory-substrate-loading">
          Loading memory telemetry&hellip;
        </div>
      )}
      {error !== null && (
        <div className={styles.error} data-testid="memory-substrate-error">
          Failed to load memory telemetry: {error}
        </div>
      )}
      {data !== null && !loading && error === null && <MemoryStats data={data} />}
    </div>
  )
}

function MemoryStats({ data }: { data: MemorySubstrateStats }) {
  return (
    <>
      <div className={styles.caveat} data-testid="memory-substrate-caveat">
        <strong>First-pass, DB-derived.</strong> Counts come from{' '}
        <code>proj_memories</code> + the events ledger. The vault-vs-harness-dir
        materialization reconciliation is intentionally omitted here &mdash; that drift
        belongs to the legacy harness auto-memory writer being retired in chain{' '}
        <code>own-memory-read-then-disable-harness-auto-memory</code>. Presentation will be
        reshaped by the planned telemetry-unification push.
      </div>

      <div className={styles.cards} data-testid="memory-substrate-cards">
        <StatCard label="Memories" value={data.total_memories} testid="stat-total-memories" />
        <StatCard
          label="MemoryWritten events"
          value={data.memory_written_total}
          hint="incl. edits + since-deleted"
          testid="stat-events"
        />
        <StatCard
          label="parse_context hits"
          value={data.parse_context_hits}
          hint="grounding events surfacing a memory"
          testid="stat-parse-context-hits"
        />
        <StatCard label="Kinds" value={data.by_kind.length} testid="stat-kinds" />
      </div>

      <div className={styles.chartsRow}>
        <KeyCountChart
          heading="Memories by kind"
          axisNote="proj_memories.kind"
          rows={data.by_kind}
          testid="chart-by-kind"
        />
        <KeyCountChart
          heading="MemoryWritten by source"
          axisNote="payload.source"
          rows={data.by_source}
          testid="chart-by-source"
        />
      </div>

      <EventRateChart points={data.event_rate} testid="chart-event-rate" />
    </>
  )
}

function StatCard({
  label,
  value,
  hint,
  testid,
}: {
  label: string
  value: number
  hint?: string
  testid: string
}) {
  return (
    <div className={styles.card} data-testid={testid}>
      <span className={styles.cardValue}>{value.toLocaleString()}</span>
      <span className={styles.cardLabel}>{label}</span>
      {hint !== undefined && <span className={styles.cardHint}>{hint}</span>}
    </div>
  )
}

function KeyCountChart({
  heading,
  axisNote,
  rows,
  testid,
}: {
  heading: string
  axisNote: string
  rows: MemoryKindCount[]
  testid: string
}) {
  return (
    <div className={styles.chartCard} data-testid={testid}>
      <h2 className={styles.cardHeading}>
        {heading} <span className={styles.headingAxis}>{axisNote}</span>
      </h2>
      <div className={styles.chartWrap} role="img" aria-label={heading}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="key" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="count" name="count" fill="var(--color-accent)" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function EventRateChart({
  points,
  testid,
}: {
  points: MemoryRatePoint[]
  testid: string
}) {
  return (
    <div className={styles.chartCard} data-testid={testid}>
      <h2 className={styles.cardHeading}>
        MemoryWritten per day <span className={styles.headingAxis}>events.ts</span>
      </h2>
      <div className={styles.chartWrap} role="img" aria-label="MemoryWritten events per day">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="day" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="count" name="events" fill="var(--color-accent)" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
