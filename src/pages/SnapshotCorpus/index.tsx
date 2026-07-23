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
import { getSnapshotCorpusStats } from '../../api/arcCorpus'
import type { ArcCorpusBucket, ArcCorpusStatsResponse } from '../../api/types.gen'
import styles from './SnapshotCorpus.module.css'

/**
 * SnapshotCorpusPage renders arc-close snapshot-corpus readiness telemetry
 * (chain arc-close-snapshot-corpus-capture T6). The corpus is the ML
 * training substrate for the arc-close classifier / smart-filter chains;
 * this surface makes it understandable at a glance instead of only via raw
 * SQL. First-pass ahead of the telemetry-unification push — favors a
 * working, tested read of the real data over final information architecture.
 */
export function SnapshotCorpusPage() {
  const [data, setData] = useState<ArcCorpusStatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true)
    setError(null)
    getSnapshotCorpusStats(ctrl.signal)
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
    <div className={styles.page} data-testid="snapshot-corpus-page">
      <header className={styles.header}>
        <h1 className={styles.title}>Arc-Close Snapshot Corpus</h1>
        <p className={styles.subtitle}>
          Training substrate captured by the arc-close review path (
          <code className={styles.metaNote}>arcreview_snapshot_corpus</code>).
          Each row is the exact message snapshot fed to Qwen at one fire,
          joinable to that fire&rsquo;s decisions for a (snapshot, labels)
          training tuple.
        </p>
      </header>

      {loading && (
        <div className={styles.placeholder} data-testid="snapshot-corpus-loading">
          Loading corpus telemetry&hellip;
        </div>
      )}
      {error !== null && (
        <div className={styles.error} data-testid="snapshot-corpus-error">
          Failed to load corpus telemetry: {error}
        </div>
      )}
      {data !== null && !loading && error === null && <CorpusStats data={data} />}
    </div>
  )
}

function CorpusStats({ data }: { data: ArcCorpusStatsResponse }) {
  const live = data.by_source['live'] ?? 0
  const recovered = data.by_source['recovered'] ?? 0
  const pct = (n: number) =>
    data.total_rows > 0 ? Math.round((n / data.total_rows) * 100) : 0

  return (
    <>
      <div className={styles.caveat} data-testid="snapshot-corpus-caveat">
        <strong>Holdout by session.</strong> The corpus is fire-rich but
        session-poor ({data.total_rows.toLocaleString()} rows /{' '}
        {data.distinct_sessions} sessions). ML exporters MUST split
        train/holdout <em>by session</em> &mdash; a fire-level split leaks.{' '}
        <code>truncated</code> is near-constant across rows (arc-close fires at
        the end of long arcs, so the 20-turn / 4000-token window almost always
        drops an older turn); treat it as near-zero-signal, not a feature.
      </div>

      <div className={styles.cards} data-testid="snapshot-corpus-cards">
        <StatCard label="Total rows" value={data.total_rows} testid="stat-total" />
        <StatCard
          label="Distinct sessions"
          value={data.distinct_sessions}
          testid="stat-sessions"
        />
        <StatCard
          label="Tuple-complete"
          value={data.tuple_complete_rows}
          hint={`${pct(data.tuple_complete_rows)}% of rows`}
          testid="stat-complete"
        />
        <StatCard
          label="Truncated"
          value={data.truncated_rows}
          hint={`${pct(data.truncated_rows)}% of rows`}
          testid="stat-truncated"
        />
      </div>

      <div className={styles.sourceSplit} data-testid="snapshot-corpus-source">
        <h2 className={styles.cardHeading}>Capture source</h2>
        <div className={styles.sourceRow}>
          <SourceBadge label="live" value={live} pct={pct(live)} />
          <SourceBadge label="recovered" value={recovered} pct={pct(recovered)} />
        </div>
      </div>

      <div className={styles.chartsRow}>
        <DistributionChart
          heading="Messages per snapshot"
          axisNote="message_count"
          buckets={data.message_count_buckets}
          testid="chart-message-count"
        />
        <DistributionChart
          heading="Estimated tokens per snapshot"
          axisNote="estimated_tokens"
          buckets={data.estimated_tokens_buckets}
          testid="chart-estimated-tokens"
        />
      </div>
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

function SourceBadge({
  label,
  value,
  pct,
}: {
  label: string
  value: number
  pct: number
}) {
  return (
    <div className={styles.sourceBadge} data-testid={`source-${label}`} data-tone={label}>
      <span className={styles.sourceValue}>{value.toLocaleString()}</span>
      <span className={styles.sourceLabel}>{label}</span>
      <span className={styles.sourcePct}>{pct}%</span>
    </div>
  )
}

function DistributionChart({
  heading,
  axisNote,
  buckets,
  testid,
}: {
  heading: string
  axisNote: string
  buckets: ArcCorpusBucket[]
  testid: string
}) {
  return (
    <div className={styles.chartCard} data-testid={testid}>
      <h2 className={styles.cardHeading}>
        {heading} <span className={styles.headingAxis}>{axisNote}</span>
      </h2>
      <div className={styles.chartWrap} role="img" aria-label={heading}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={buckets} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="count" name="rows" fill="var(--color-accent)" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
