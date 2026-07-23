import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  type AnalyticsRangeFilters,
  getSuccessRate,
  getVolumeBySource,
} from '../../api/telemetry'
import type {
  AnalyticsSuccessResponse,
  AnalyticsVolumeResponse,
  SegmentAxis,
} from '../../lib/telemetry'
import { SEGMENT_AXES } from '../../lib/telemetry'
import styles from './Telemetry.module.css'

/**
 * TelemetryAnalyticsPage — top-level /telemetry view (QF4).
 *
 * Two charts side-by-side or stacked (responsive):
 *   1. Query volume — multi-line chart over /analytics/volume-by-source
 *   2. Retrieval success rate — multi-line chart over /analytics/success-rate
 *
 * Both share a single segment axis (`action` | `query_source`) and a
 * single time range, both URL-encoded so links are shareable + back/
 * forward navigation works.
 *
 * Three-axis discipline (TELEMETRY_FRONTEND §2):
 *   - segment toggle picks ONE axis at a time
 *   - chart legend reads keys from the response data — no hardcoded
 *     enum — so new action / query_source values forward-compat
 *     automatically (reference_resolution, toolsearch_rerank, etc.)
 */

const DEFAULT_RANGE_DAYS = 30
const DEFAULT_SEGMENT: SegmentAxis = 'action'

interface PageState {
  segment: SegmentAxis
  since: string // YYYY-MM-DD
  until: string // YYYY-MM-DD
  project: string | null
}

function parseSegment(raw: string | null): SegmentAxis {
  if (raw === 'action' || raw === 'query_source') return raw
  return DEFAULT_SEGMENT
}

function defaultRange(): { since: string; until: string } {
  const until = new Date()
  const since = new Date(until.getTime() - DEFAULT_RANGE_DAYS * 86_400_000)
  return {
    since: since.toISOString().slice(0, 10),
    until: until.toISOString().slice(0, 10),
  }
}

export function TelemetryAnalyticsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialRange = useMemo(() => defaultRange(), [])

  const state: PageState = {
    segment: parseSegment(searchParams.get('seg')),
    since: searchParams.get('since') ?? initialRange.since,
    until: searchParams.get('until') ?? initialRange.until,
    project: searchParams.get('project'),
  }

  function updateState(patch: Partial<PageState>) {
    const next = { ...state, ...patch }
    const params = new URLSearchParams()
    params.set('seg', next.segment)
    params.set('since', next.since)
    params.set('until', next.until)
    if (next.project !== null && next.project !== '')
      params.set('project', next.project)
    setSearchParams(params, { replace: true })
  }

  const filters: AnalyticsRangeFilters = {
    segment: state.segment,
    since: state.since,
    until: state.until,
    project: state.project ?? undefined,
  }

  return (
    <div className={styles.page} data-testid="telemetry-page">
      <header className={styles.header}>
        <h2 className={styles.title}>Search Analytics</h2>
        <p className={styles.subtitle}>
          Read-side audit of the agent's search activity.{' '}
          <span className={styles.metaNote}>
            Range: {state.since} → {state.until}.
          </span>
        </p>
      </header>

      <div className={styles.controls} role="group" aria-label="Filters">
        <SegmentToggle
          value={state.segment}
          onChange={(seg) => updateState({ segment: seg })}
        />
        <RangeInputs
          since={state.since}
          until={state.until}
          onChange={(since, until) => updateState({ since, until })}
        />
      </div>

      <div className={styles.chartsRow}>
        <VolumeChartCard filters={filters} />
        <SuccessChartCard filters={filters} />
      </div>
    </div>
  )
}

// --- controls ---------------------------------------------------------

function SegmentToggle({
  value,
  onChange,
}: {
  value: SegmentAxis
  onChange: (seg: SegmentAxis) => void
}) {
  return (
    <fieldset className={styles.segmentToggle}>
      <legend className={styles.legendLabel}>Segment by</legend>
      {SEGMENT_AXES.map((axis) => (
        <label key={axis} className={styles.segmentOption}>
          <input
            type="radio"
            name="telemetry-segment"
            value={axis}
            checked={value === axis}
            onChange={() => onChange(axis)}
            data-testid={`telemetry-segment-${axis}`}
          />
          <span>{axis}</span>
        </label>
      ))}
    </fieldset>
  )
}

function RangeInputs({
  since,
  until,
  onChange,
}: {
  since: string
  until: string
  onChange: (since: string, until: string) => void
}) {
  return (
    <div className={styles.rangeInputs}>
      <label className={styles.rangeLabel}>
        <span>Since</span>
        <input
          type="date"
          value={since}
          onChange={(e) => onChange(e.target.value, until)}
          data-testid="telemetry-since"
        />
      </label>
      <label className={styles.rangeLabel}>
        <span>Until</span>
        <input
          type="date"
          value={until}
          onChange={(e) => onChange(since, e.target.value)}
          data-testid="telemetry-until"
        />
      </label>
    </div>
  )
}

// --- chart cards ------------------------------------------------------

function VolumeChartCard({ filters }: { filters: AnalyticsRangeFilters }) {
  const { data, loading, error } = useVolumeData(filters)

  return (
    <section
      className={styles.chartCard}
      aria-labelledby="telemetry-volume-heading"
      data-testid="telemetry-volume-card"
    >
      <h3 id="telemetry-volume-heading" className={styles.cardHeading}>
        Query Volume{' '}
        <span className={styles.headingAxis}>by {filters.segment}</span>
      </h3>
      {loading ? (
        <p className={styles.placeholder} data-testid="telemetry-volume-loading">
          Loading volume…
        </p>
      ) : error !== null ? (
        <p className={styles.error} role="alert" data-testid="telemetry-volume-error">
          {error}
        </p>
      ) : data === null || data.buckets.length === 0 ? (
        <p className={styles.empty} data-testid="telemetry-volume-empty">
          No queries in this time range
          {filters.project !== undefined ? ` for project ${filters.project}` : ''}.
        </p>
      ) : (
        <VolumeChart data={data} />
      )}
    </section>
  )
}

function SuccessChartCard({ filters }: { filters: AnalyticsRangeFilters }) {
  const { data, loading, error } = useSuccessData(filters)

  return (
    <section
      className={styles.chartCard}
      aria-labelledby="telemetry-success-heading"
      data-testid="telemetry-success-card"
    >
      <h3 id="telemetry-success-heading" className={styles.cardHeading}>
        Retrieval Success Rate{' '}
        <span className={styles.headingAxis}>by {filters.segment}</span>
      </h3>
      {loading ? (
        <p className={styles.placeholder} data-testid="telemetry-success-loading">
          Loading success-rate…
        </p>
      ) : error !== null ? (
        <p className={styles.error} role="alert" data-testid="telemetry-success-error">
          {error}
        </p>
      ) : data === null || data.buckets.length === 0 ? (
        <p className={styles.empty} data-testid="telemetry-success-empty">
          No queries in this time range
          {filters.project !== undefined ? ` for project ${filters.project}` : ''}.
        </p>
      ) : (
        <>
          {looksLikeForwardFillEmpty(data) && <ForwardFillCaveat />}
          <SuccessChart data={data} />
        </>
      )}
    </section>
  )
}

/**
 * looksLikeForwardFillEmpty detects the substrate-feedback-loop-not-closed
 * shape: queries WERE recorded in the range (query_count > 0 for at
 * least one segment) but no interaction or resolution ever fired
 * (success_count == 0 across every segment). The canonical cause is
 * the Stop hook that detects click signals not being wired —
 * grounding_events lands but query_interactions stays empty. The
 * success classifier `max_click_weight >= 0.8 OR had_resolved_from = 1`
 * structurally returns false for every query in that state, producing
 * a 0% line per segment that looks like "everything failed" rather
 * than "the feedback loop isn't closed yet."
 *
 * False-positive shape: every retrieval in the range really did fail.
 * The caveat copy is honest about both possibilities so a real-zero
 * operator still gets useful information.
 */
function looksLikeForwardFillEmpty(data: AnalyticsSuccessResponse): boolean {
  const cells = Object.values(data.totals_by_segment)
  if (cells.length === 0) return false
  const totalQueries = cells.reduce((s, c) => s + c.query_count, 0)
  const totalSuccess = cells.reduce((s, c) => s + c.success_count, 0)
  return totalQueries > 0 && totalSuccess === 0
}

function ForwardFillCaveat() {
  return (
    <p
      className={styles.caveat}
      role="note"
      data-testid="telemetry-success-forward-fill-caveat"
    >
      <strong>0% across every segment.</strong> This usually means the
      click-detection feedback loop isn't closed — grounding_events land
      from each search, but query_interactions stays empty when the
      Stop-hook that detects followed / cited / mentioned / resolved-from
      signals isn't wired. See{' '}
      <code>docs/TELEMETRY_RETROSPECTIVE_2026-05-17.md</code>{' '}
      §forward-fill for context. (If you believe the loop IS wired, every
      retrieval in this range genuinely failed — narrow the time range
      to isolate the regression.)
    </p>
  )
}

// --- charts -----------------------------------------------------------

const LINE_PALETTE = [
  '#3b5bdb',
  '#dc2626',
  '#15803d',
  '#d97706',
  '#a855f7',
  '#0ea5e9',
  '#ec4899',
  '#84cc16',
  '#06b6d4',
  '#6366f1',
]

function colorForSegment(_name: string, index: number): string {
  return LINE_PALETTE[index % LINE_PALETTE.length]
}

function VolumeChart({ data }: { data: AnalyticsVolumeResponse }) {
  const segments = Object.keys(data.totals_by_segment).sort()
  const rows = data.buckets.map((b) => {
    const row: Record<string, number | string> = { day: b.day }
    for (const seg of segments) row[seg] = b.segments[seg] ?? 0
    return row
  })
  return (
    <div
      className={styles.chartWrap}
      role="img"
      aria-label={`Query volume by ${data.segment}`}
      data-testid="telemetry-volume-chart"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis dataKey="day" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip />
          <Legend />
          {segments.map((seg, i) => (
            <Line
              key={seg}
              type="monotone"
              dataKey={seg}
              name={seg}
              stroke={colorForSegment(seg, i)}
              dot={false}
              strokeWidth={1.5}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function SuccessChart({ data }: { data: AnalyticsSuccessResponse }) {
  const segments = Object.keys(data.totals_by_segment).sort()
  // Flatten each bucket's per-segment cell into one row per day.
  const rows = data.buckets.map((b) => {
    const row: Record<string, number | string> = { day: b.day }
    for (const seg of segments) {
      const cell = b.segments[seg]
      row[seg] = cell !== undefined ? Number((cell.success_rate * 100).toFixed(1)) : 0
    }
    return row
  })
  return (
    <div
      className={styles.chartWrap}
      role="img"
      aria-label={`Retrieval success rate by ${data.segment}`}
      data-testid="telemetry-success-chart"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis dataKey="day" tick={{ fontSize: 11 }} />
          <YAxis
            tick={{ fontSize: 11 }}
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip
            formatter={(value) =>
              typeof value === 'number' ? `${value.toFixed(1)}%` : String(value)
            }
          />
          <Legend />
          {segments.map((seg, i) => (
            <Line
              key={seg}
              type="monotone"
              dataKey={seg}
              name={seg}
              stroke={colorForSegment(seg, i)}
              dot={false}
              strokeWidth={1.5}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// --- fetch hooks ------------------------------------------------------

function useVolumeData(filters: AnalyticsRangeFilters): {
  data: AnalyticsVolumeResponse | null
  loading: boolean
  error: string | null
} {
  const [data, setData] = useState<AnalyticsVolumeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (abortRef.current !== null) abortRef.current.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    setError(null)
    getVolumeBySource(filters, ctrl.signal)
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
  }, [filters.segment, filters.since, filters.until, filters.project])

  return { data, loading, error }
}

function useSuccessData(filters: AnalyticsRangeFilters): {
  data: AnalyticsSuccessResponse | null
  loading: boolean
  error: string | null
} {
  const [data, setData] = useState<AnalyticsSuccessResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (abortRef.current !== null) abortRef.current.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    setError(null)
    getSuccessRate(filters, ctrl.signal)
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
  }, [filters.segment, filters.since, filters.until, filters.project])

  return { data, loading, error }
}
