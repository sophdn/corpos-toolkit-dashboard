import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  BarChart,
  Bar,
  Legend,
} from 'recharts'
import {
  getContextPullDetail,
  getContextPullStats,
  getContextPullsTimeseries,
  listContextPulls,
  type ContextPullListFilters,
} from '../../api/contextPulls'
import {
  CONFIDENCE_TIERS,
  CONTEXT_PULL_QUERY_SOURCES,
  CONTEXT_PULL_SHAPES,
  type ContextPullDetail,
  type ContextPullListResponse,
  type ContextPullRow,
  type ContextPullStatsResponse,
  type ContextPullsTimeseriesResponse,
} from '../../lib/contextPulls'
import styles from './ContextPulls.module.css'

/**
 * ContextPullInspector — operator-facing audit of the reference-resolution
 * substrate's behavior (RF3). Answers "what references did the agent
 * detect, what got resolved, what got cited" per session / per shape.
 *
 * FOUR-AXIS DISCIPLINE (load-bearing): query_source / shape /
 * confidence_tier / source_type. Filter param names match exact column
 * names — NO bare `source` / `kind`.
 *
 * THREE-EMPTY-STATE TAXONOMY (per vault learning
 * 2026-05-18_forward-fill-caveat-ui-pattern.md):
 *   1. Producer not wired: substrate has no reference_resolution rows
 *      → distinct copy naming migration 040 land time.
 *   2. Filter narrows to zero: total_references > 0 but filtered list
 *      is empty → copy points at the active filters.
 *   3. Genuinely empty: substrate alive, no recent activity → standard
 *      empty copy.
 */

const PAGE_SIZE = 50
const DEFAULT_SEGMENT = 'shape' as const

interface FilterState {
  querySource: string[]
  shape: string[]
  confidenceTier: string[]
  sourceType: string[]
  sessionID: string
  promptID: string
  spanID: string
  project: string | null
  q: string
  since: string
  until: string
}

function parseRepeated(p: URLSearchParams, key: string): string[] {
  return p.getAll(key)
}

function readFilters(p: URLSearchParams): FilterState {
  return {
    querySource: parseRepeated(p, 'query_source'),
    shape: parseRepeated(p, 'shape'),
    confidenceTier: parseRepeated(p, 'confidence_tier'),
    sourceType: parseRepeated(p, 'source_type'),
    sessionID: p.get('session_id') ?? '',
    promptID: p.get('prompt_id') ?? '',
    spanID: p.get('span_id') ?? '',
    project: p.get('project'),
    q: p.get('q') ?? '',
    since: p.get('since') ?? '',
    until: p.get('until') ?? '',
  }
}

function writeFilters(s: FilterState, eventId: string | null): URLSearchParams {
  const p = new URLSearchParams()
  for (const v of s.querySource) p.append('query_source', v)
  for (const v of s.shape) p.append('shape', v)
  for (const v of s.confidenceTier) p.append('confidence_tier', v)
  for (const v of s.sourceType) p.append('source_type', v)
  if (s.sessionID !== '') p.set('session_id', s.sessionID)
  if (s.promptID !== '') p.set('prompt_id', s.promptID)
  if (s.spanID !== '') p.set('span_id', s.spanID)
  if (s.project !== null && s.project !== '') p.set('project', s.project)
  if (s.q !== '') p.set('q', s.q)
  if (s.since !== '') p.set('since', s.since)
  if (s.until !== '') p.set('until', s.until)
  if (eventId !== null) p.set('event', eventId)
  return p
}

function toApiFilters(s: FilterState): ContextPullListFilters {
  return {
    query_source: s.querySource.length > 0 ? s.querySource : undefined,
    shape: s.shape.length > 0 ? s.shape : undefined,
    confidence_tier:
      s.confidenceTier.length > 0 ? s.confidenceTier : undefined,
    source_type: s.sourceType.length > 0 ? s.sourceType : undefined,
    session_id: s.sessionID !== '' ? s.sessionID : undefined,
    prompt_id: s.promptID !== '' ? s.promptID : undefined,
    span_id: s.spanID !== '' ? s.spanID : undefined,
    project: s.project !== null && s.project !== '' ? s.project : undefined,
    q: s.q !== '' ? s.q : undefined,
    since: s.since !== '' ? s.since : undefined,
    until: s.until !== '' ? s.until : undefined,
    limit: PAGE_SIZE,
  }
}

/** Trips when the operator's filters include non-reference_resolution
 *  query_sources. RF3 surfaces the harness-reminder-interception trend
 *  panel only then (bug 1443 follow-on). */
function admitsBeyondReferenceResolution(s: FilterState): boolean {
  if (s.querySource.length === 0) return false
  return s.querySource.some((qs) => qs !== 'reference_resolution')
}

export function ContextPullInspector() {
  const [searchParams, setSearchParams] = useSearchParams()
  const state: FilterState = useMemo(
    () => readFilters(searchParams),
    [searchParams],
  )
  const drawerEventID = searchParams.get('event')

  function updateFilters(patch: Partial<FilterState>) {
    const next = { ...state, ...patch }
    setSearchParams(writeFilters(next, drawerEventID), { replace: true })
  }

  function openDrawer(eventId: number) {
    setSearchParams(writeFilters(state, String(eventId)), { replace: true })
  }

  function closeDrawer() {
    setSearchParams(writeFilters(state, null), { replace: true })
  }

  function clearAll() {
    setSearchParams(new URLSearchParams())
  }

  const apiFilters = toApiFilters(state)
  const hasAnyFilter = filterKeyDigest(state) !== ''

  return (
    <div className={styles.page} data-testid="context-pulls-page">
      <header className={styles.header}>
        <h2 className={styles.title}>Context Pull Inspector</h2>
        <p className={styles.subtitle}>
          What references did the agent detect, what got resolved, what got
          cited.
        </p>
      </header>

      <StatsBanner filters={apiFilters} />
      <TrendStrip filters={apiFilters} />
      <FilterBar
        state={state}
        onChange={updateFilters}
        onClearAll={clearAll}
        hasAnyFilter={hasAnyFilter}
      />
      {admitsBeyondReferenceResolution(state) && (
        <HarnessReminderPanel filters={apiFilters} />
      )}
      <ContextPullList
        filters={apiFilters}
        onRowClick={openDrawer}
        hasAnyFilter={hasAnyFilter}
      />
      {drawerEventID !== null && (
        <ResolutionDetailDrawer
          eventId={Number(drawerEventID)}
          onClose={closeDrawer}
        />
      )}
    </div>
  )
}

function filterKeyDigest(s: FilterState): string {
  const parts: string[] = []
  if (s.querySource.length > 0) parts.push(`qs:${s.querySource.join(',')}`)
  if (s.shape.length > 0) parts.push(`sh:${s.shape.join(',')}`)
  if (s.confidenceTier.length > 0)
    parts.push(`ct:${s.confidenceTier.join(',')}`)
  if (s.sourceType.length > 0) parts.push(`st:${s.sourceType.join(',')}`)
  if (s.sessionID !== '') parts.push(`sess:${s.sessionID}`)
  if (s.promptID !== '') parts.push(`pid:${s.promptID}`)
  if (s.spanID !== '') parts.push(`span:${s.spanID}`)
  if (s.project !== null && s.project !== '') parts.push(`p:${s.project}`)
  if (s.q !== '') parts.push(`q:${s.q}`)
  if (s.since !== '') parts.push(`from:${s.since}`)
  if (s.until !== '') parts.push(`to:${s.until}`)
  return parts.join('|')
}

// --- stats banner -----------------------------------------------------

function StatsBanner({ filters }: { filters: ContextPullListFilters }) {
  const { data, loading, error } = useStats(filters)

  if (loading && data === null) {
    return (
      <section
        className={styles.statsBanner}
        aria-busy="true"
        data-testid="context-pulls-stats-loading"
      >
        <p className={styles.placeholder}>Loading distribution…</p>
      </section>
    )
  }
  if (error !== null) {
    return (
      <section
        className={styles.statsBanner}
        data-testid="context-pulls-stats-error"
      >
        <p className={styles.error} role="alert">
          Stats unavailable: {error}
        </p>
      </section>
    )
  }
  if (data === null) return null

  // FOURTH EMPTY-STATE SHAPE (not in vault learning 2026-05-18): rows
  // exist but predate the reference_resolution_emits side-table
  // amendment (RF2). Detect: total > 0 AND every shape bucket is 0
  // (the side-table populates by_shape; orphan rows contribute nothing).
  const allShapeBucketsZero =
    Object.keys(data.by_shape).length === 0 ||
    Object.values(data.by_shape).every((n) => n === 0)
  const sideTableAbsent = data.total_references > 0 && allShapeBucketsZero

  return (
    <section
      className={styles.statsBanner}
      data-testid="context-pulls-stats"
      aria-labelledby="context-pulls-stats-heading"
    >
      <h3 id="context-pulls-stats-heading" className={styles.statsHeading}>
        {data.total_references} reference
        {data.total_references === 1 ? '' : 's'} resolved
        {data.total_references === 0 && (
          <span className={styles.forwardFillNote}>
            {' '}
            (substrate may be empty — reference-resolution-substrate T5
            landed in migration 040, 2026-05-18)
          </span>
        )}
      </h3>
      {sideTableAbsent && (
        <p
          className={styles.preAmendmentBanner}
          data-testid="context-pulls-pre-amendment-banner"
        >
          All {data.total_references} rows predate migration 042 / the
          handler-side amendment (RF2, 2026-05-19). Their per-resolution
          detail (shape, confidence_tier, candidate breakdown,
          presentation outcome) is unrecoverable — that data was only
          ever persisted in the emit envelope, not on grounding_events.
          New emits from a post-RF2 binary will populate the side-table;
          run <code>/mcp reconnect</code> in active sessions to pick up
          the new binary, or wait for a new session boot.
        </p>
      )}
      <div className={styles.statsGrid}>
        <DistributionList
          axis="shape"
          counts={data.by_shape}
          enumOrder={CONTEXT_PULL_SHAPES}
        />
        <DistributionList
          axis="confidence_tier"
          counts={data.by_confidence_tier}
          enumOrder={CONFIDENCE_TIERS}
        />
        <DistributionList axis="source_type" counts={data.by_source_type} />
        <DistributionList
          axis="query_source"
          counts={data.by_query_source}
          enumOrder={CONTEXT_PULL_QUERY_SOURCES}
        />
      </div>
    </section>
  )
}

function useStats(filters: ContextPullListFilters): {
  data: ContextPullStatsResponse | null
  loading: boolean
  error: string | null
} {
  const [data, setData] = useState<ContextPullStatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const key = JSON.stringify(filters)
  useEffect(() => {
    if (abortRef.current !== null) abortRef.current.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    setError(null)
    getContextPullStats(filters, ctrl.signal)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return { data, loading, error }
}

function DistributionList({
  axis,
  counts,
  enumOrder,
}: {
  axis: string
  counts: Record<string, number>
  enumOrder?: readonly string[]
}) {
  // Zero-fill when an enumOrder is supplied so the chart geometry stays
  // stable across narrowings (matches Go zeroFill posture).
  const entries =
    enumOrder !== undefined
      ? enumOrder.map((k) => [k, counts[k] ?? 0] as [string, number])
      : Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))
  return (
    <div
      className={styles.distList}
      data-testid={`context-pulls-dist-${axis}`}
    >
      <h4 className={styles.distHeading}>{axis}</h4>
      <dl className={styles.distRows}>
        {entries.length === 0 ? (
          <p className={styles.distEmpty}>(no values)</p>
        ) : (
          entries.map(([key, value]) => (
            <div key={key} className={styles.distRow}>
              <dt className={styles.distKey}>{key}</dt>
              <dd className={styles.distValue}>{value}</dd>
            </div>
          ))
        )}
      </dl>
    </div>
  )
}

// --- trend strip ------------------------------------------------------

function TrendStrip({ filters }: { filters: ContextPullListFilters }) {
  const [data, setData] =
    useState<ContextPullsTimeseriesResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const key = JSON.stringify(filters)

  useEffect(() => {
    if (abortRef.current !== null) abortRef.current.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setError(null)
    getContextPullsTimeseries(
      { ...filters, segment: DEFAULT_SEGMENT },
      ctrl.signal,
    )
      .then(setData)
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return
        setError(err instanceof Error ? err.message : 'unknown error')
      })
    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  if (error !== null) {
    return (
      <section
        className={styles.trendStrip}
        data-testid="context-pulls-trend-error"
      >
        <p className={styles.error} role="alert">
          Trend unavailable: {error}
        </p>
      </section>
    )
  }
  if (data === null || data.buckets.length === 0) {
    return (
      <section
        className={styles.trendStrip}
        data-testid="context-pulls-trend-empty"
      >
        <p className={styles.placeholder}>No data in range.</p>
      </section>
    )
  }

  const allSegments = new Set<string>()
  for (const b of data.buckets) {
    for (const k of Object.keys(b.segments)) allSegments.add(k)
  }
  const segmentKeys = Array.from(allSegments).sort()

  return (
    <section
      className={styles.trendStrip}
      aria-label="Daily reference-resolution volume by shape"
      data-testid="context-pulls-trend"
    >
      <ResponsiveContainer width="100%" height={100}>
        <BarChart
          data={data.buckets.map((b) => ({ day: b.day, ...b.segments }))}
        >
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="2 4" />
          <XAxis dataKey="day" fontSize={10} />
          <YAxis fontSize={10} />
          <Tooltip />
          <Legend verticalAlign="top" height={20} fontSize={10} />
          {segmentKeys.map((k, i) => (
            <Bar
              key={k}
              dataKey={k}
              stackId="trend"
              fill={trendBarColor(i)}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </section>
  )
}

// Stable palette — recharts has no built-in categorical scheme.
function trendBarColor(i: number): string {
  const palette = [
    '#5b8bd6',
    '#7eb87e',
    '#d29cca',
    '#d6a05b',
    '#a08bd6',
    '#d65b8b',
    '#5bd6c6',
    '#bcc36b',
  ]
  return palette[i % palette.length]
}

// --- filter bar -------------------------------------------------------

function FilterBar({
  state,
  onChange,
  onClearAll,
  hasAnyFilter,
}: {
  state: FilterState
  onChange: (patch: Partial<FilterState>) => void
  onClearAll: () => void
  hasAnyFilter: boolean
}) {
  return (
    <form
      className={styles.filterBar}
      role="search"
      data-testid="context-pulls-filters"
      onSubmit={(e) => e.preventDefault()}
    >
      <MultiSelect
        label="query_source"
        options={CONTEXT_PULL_QUERY_SOURCES}
        selected={state.querySource}
        testid="context-pulls-filter-query-source"
        onChange={(vals) => onChange({ querySource: vals })}
      />
      <MultiSelect
        label="shape"
        options={CONTEXT_PULL_SHAPES}
        selected={state.shape}
        testid="context-pulls-filter-shape"
        onChange={(vals) => onChange({ shape: vals })}
      />
      <MultiSelect
        label="confidence_tier"
        options={CONFIDENCE_TIERS}
        selected={state.confidenceTier}
        testid="context-pulls-filter-confidence-tier"
        onChange={(vals) => onChange({ confidenceTier: vals })}
      />
      <label className={styles.searchLabel}>
        <span>project</span>
        <input
          type="text"
          value={state.project ?? ''}
          onChange={(e) =>
            onChange({ project: e.target.value === '' ? null : e.target.value })
          }
          data-testid="context-pulls-filter-project"
          placeholder="mcp-servers…"
        />
      </label>
      <label className={styles.searchLabel}>
        <span>reference text contains</span>
        <input
          type="search"
          value={state.q}
          onChange={(e) => onChange({ q: e.target.value })}
          data-testid="context-pulls-filter-q"
          placeholder="free-text search…"
        />
      </label>
      <label className={styles.searchLabel}>
        <span>since</span>
        <input
          type="date"
          value={state.since}
          onChange={(e) => onChange({ since: e.target.value })}
          data-testid="context-pulls-filter-since"
        />
      </label>
      <label className={styles.searchLabel}>
        <span>until</span>
        <input
          type="date"
          value={state.until}
          onChange={(e) => onChange({ until: e.target.value })}
          data-testid="context-pulls-filter-until"
        />
      </label>
      <label className={styles.searchLabel}>
        <span>span_id</span>
        <input
          type="text"
          value={state.spanID}
          onChange={(e) => onChange({ spanID: e.target.value })}
          data-testid="context-pulls-filter-span-id"
          placeholder="UUID"
        />
      </label>
      <label className={styles.searchLabel}>
        <span>prompt_id</span>
        <input
          type="text"
          value={state.promptID}
          onChange={(e) => onChange({ promptID: e.target.value })}
          data-testid="context-pulls-filter-prompt-id"
          placeholder="UUID"
        />
      </label>
      {hasAnyFilter && (
        <button
          type="button"
          className={styles.actionBtn}
          onClick={onClearAll}
          data-testid="context-pulls-clear-filters"
        >
          Clear filters
        </button>
      )}
    </form>
  )
}

function MultiSelect({
  label,
  options,
  selected,
  testid,
  onChange,
}: {
  label: string
  options: readonly string[]
  selected: string[]
  testid: string
  onChange: (vals: string[]) => void
}) {
  function toggle(v: string) {
    if (selected.includes(v)) {
      onChange(selected.filter((s) => s !== v))
    } else {
      onChange([...selected, v])
    }
  }
  return (
    <fieldset className={styles.multiSelect} data-testid={testid}>
      <legend className={styles.legendLabel}>{label}</legend>
      {options.map((opt) => (
        <label key={opt} className={styles.multiSelectOption}>
          <input
            type="checkbox"
            checked={selected.includes(opt)}
            onChange={() => toggle(opt)}
            data-testid={`${testid}-${opt}`}
          />
          <span>{opt}</span>
        </label>
      ))}
    </fieldset>
  )
}

// --- list -------------------------------------------------------------

function ContextPullList({
  filters,
  onRowClick,
  hasAnyFilter,
}: {
  filters: ContextPullListFilters
  onRowClick: (id: number) => void
  hasAnyFilter: boolean
}) {
  const [data, setData] = useState<ContextPullListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const key = JSON.stringify(filters)

  useEffect(() => {
    if (abortRef.current !== null) abortRef.current.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    setError(null)
    listContextPulls(filters, ctrl.signal)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  if (loading && data === null) {
    return (
      <p className={styles.placeholder} data-testid="context-pulls-loading">
        Loading reference resolutions…
      </p>
    )
  }
  if (error !== null) {
    return (
      <p
        className={styles.error}
        role="alert"
        data-testid="context-pulls-error"
      >
        {error}
      </p>
    )
  }
  if (data === null || data.items.length === 0) {
    return (
      <p className={styles.empty} data-testid="context-pulls-empty">
        {hasAnyFilter
          ? 'No reference resolutions match the current filters.'
          : 'No reference resolutions recorded yet.'}
      </p>
    )
  }

  return (
    <table
      className={styles.table}
      role="table"
      data-testid="context-pulls-table"
    >
      <thead>
        <tr>
          <th>When</th>
          <th>Reference</th>
          <th>shape</th>
          <th>confidence_tier</th>
          <th>resolved-to</th>
          <th>presentation</th>
          <th>ML</th>
        </tr>
      </thead>
      <tbody>
        {data.items.map((row) => (
          <ContextPullRowView
            key={row.grounding_event_id}
            row={row}
            onClick={() => onRowClick(row.grounding_event_id)}
          />
        ))}
      </tbody>
    </table>
  )
}

function ContextPullRowView({
  row,
  onClick,
}: {
  row: ContextPullRow
  onClick: () => void
}) {
  return (
    <tr
      className={styles.row}
      onClick={onClick}
      data-testid={`context-pulls-row-${row.grounding_event_id}`}
      aria-label={`Open resolution ${row.grounding_event_id} details`}
    >
      <td>{formatTs(row.ts)}</td>
      <td className={styles.cellReference}>
        <code>{row.query_text ?? '—'}</code>
      </td>
      <td>
        {row.shape !== null ? <ShapeBadge shape={row.shape} /> : '—'}
      </td>
      <td>
        {row.confidence_tier !== null ? (
          <ConfidenceTierBadge tier={row.confidence_tier} />
        ) : (
          '—'
        )}
      </td>
      <td className={styles.cellCandidate}>
        {row.first_candidate !== null ? (
          <>
            <span className={styles.sourceTypePill}>
              {row.first_candidate.source_type}
            </span>{' '}
            <code>{row.first_candidate.source_ref}</code>
          </>
        ) : (
          <span className={styles.dim}>no candidates</span>
        )}
      </td>
      <td>
        {row.presentation_recommendation !== null ? (
          <span className={styles.recommendationChip}>
            {row.presentation_recommendation}
          </span>
        ) : (
          '—'
        )}
      </td>
      <td>
        <MlConfidenceCell value={row.ml_confidence_score} />
      </td>
    </tr>
  )
}

// --- harness reminder panel (bug 1443 follow-on) ----------------------

/**
 * Renders only when the operator narrows query_source to include
 * non-reference_resolution values (typically harness_reminder_interception).
 * Plots the firing rate so it's legible whether the upstream over-fire
 * heuristic has been fixed (rate → 0) or worsens.
 */
function HarnessReminderPanel({
  filters,
}: {
  filters: ContextPullListFilters
}) {
  const [data, setData] =
    useState<ContextPullsTimeseriesResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const key = JSON.stringify(filters)

  useEffect(() => {
    if (abortRef.current !== null) abortRef.current.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setError(null)
    getContextPullsTimeseries(
      {
        ...filters,
        query_source: ['harness_reminder_interception'],
        segment: 'shape',
      },
      ctrl.signal,
    )
      .then(setData)
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return
        setError(err instanceof Error ? err.message : 'unknown error')
      })
    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return (
    <section
      className={styles.harnessPanel}
      aria-labelledby="harness-panel-heading"
      data-testid="context-pulls-harness-panel"
    >
      <h3 id="harness-panel-heading" className={styles.harnessHeading}>
        Harness reminder interception — daily fire rate
      </h3>
      <p className={styles.harnessSubtitle}>
        Bug 1443 follow-on: tracks whether the upstream over-fire heuristic
        has been fixed (rate → 0) or worsens (sustained rise). Mid-stream
        fires aren't visible from the hook side and are out of scope.
      </p>
      {error !== null ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : data === null ? (
        <p className={styles.placeholder}>Loading…</p>
      ) : data.buckets.length === 0 ? (
        <p
          className={styles.empty}
          data-testid="context-pulls-harness-empty"
        >
          No harness-reminder-interception rows in this range.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={120}>
          <BarChart
            data={data.buckets.map((b) => ({
              day: b.day,
              count: Object.values(b.segments).reduce((a, c) => a + c, 0),
            }))}
          >
            <CartesianGrid
              stroke="var(--color-border)"
              strokeDasharray="2 4"
            />
            <XAxis dataKey="day" fontSize={10} />
            <YAxis fontSize={10} />
            <Tooltip />
            <Bar dataKey="count" fill="#d6a05b" />
          </BarChart>
        </ResponsiveContainer>
      )}
    </section>
  )
}

// --- drawer -----------------------------------------------------------

function ResolutionDetailDrawer({
  eventId,
  onClose,
}: {
  eventId: number
  onClose: () => void
}) {
  const [detail, setDetail] = useState<ContextPullDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (abortRef.current !== null) abortRef.current.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    setError(null)
    getContextPullDetail(eventId, ctrl.signal)
      .then((d) => {
        setDetail(d)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return
        setError(err instanceof Error ? err.message : 'unknown error')
        setLoading(false)
      })
    return () => ctrl.abort()
  }, [eventId])

  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    function handle(e: KeyboardEvent) {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [])

  return (
    <>
      <div
        className={styles.drawerOverlay}
        onClick={onClose}
        data-testid="context-pulls-drawer-overlay"
      />
      <aside
        className={styles.drawer}
        role="dialog"
        aria-labelledby="context-pulls-drawer-title"
        data-testid="context-pulls-drawer"
      >
        <div className={styles.drawerHeader}>
          <h2
            id="context-pulls-drawer-title"
            className={styles.drawerTitle}
          >
            {detail !== null
              ? `Resolution #${detail.grounding_event.id}`
              : loading
                ? 'Loading…'
                : 'Resolution'}
          </h2>
          <button
            type="button"
            className={styles.drawerClose}
            onClick={onClose}
            aria-label="Close drawer"
            data-testid="context-pulls-drawer-close"
          >
            ×
          </button>
        </div>

        {loading ? (
          <p data-testid="context-pulls-drawer-loading">Loading…</p>
        ) : error !== null ? (
          <p
            className={styles.error}
            role="alert"
            data-testid="context-pulls-drawer-error"
          >
            {error}
          </p>
        ) : detail === null ? null : (
          <DrawerBody detail={detail} />
        )}
      </aside>
    </>
  )
}

function DrawerBody({ detail }: { detail: ContextPullDetail }) {
  return (
    <>
      <section className={styles.drawerSection}>
        <h3 className={styles.drawerSectionHeading}>Detection</h3>
        <DetectionContextBlock detail={detail} />
      </section>

      <section className={styles.drawerSection}>
        <h3 className={styles.drawerSectionHeading}>Outcome</h3>
        <div className={styles.drawerRow}>
          <span className={styles.drawerLabel}>confidence_tier</span>
          <ConfidenceTierBadge tier={detail.outcome.confidence_tier} />
        </div>
        <div className={styles.drawerRow}>
          <span className={styles.drawerLabel}>recommendation</span>
          <span className={styles.recommendationChip}>
            {detail.outcome.presentation_recommendation}
          </span>
        </div>
        <PresentedAsBlock text={detail.outcome.presented_as} />
      </section>

      <section className={styles.drawerSection}>
        <h3 className={styles.drawerSectionHeading}>Resolver</h3>
        <div className={styles.drawerRow}>
          <span className={styles.drawerLabel}>name</span>
          <code>{detail.resolver.name}</code>
        </div>
        <div className={styles.drawerRow}>
          <span className={styles.drawerLabel}>retrieval_cost_ms</span>
          <span>{detail.resolver.retrieval_cost_ms}</span>
        </div>
        {detail.resolver.err !== null && (
          <p
            className={styles.error}
            role="alert"
            data-testid="context-pulls-drawer-resolver-error"
          >
            {detail.resolver.err}
          </p>
        )}
      </section>

      <section className={styles.drawerSection}>
        <h3 className={styles.drawerSectionHeading}>
          Candidates ({detail.candidates.length})
        </h3>
        <CandidateList candidates={detail.candidates} />
      </section>

      <section className={styles.drawerSection}>
        <h3 className={styles.drawerSectionHeading}>
          Interactions ({detail.interactions.length})
        </h3>
        {detail.interactions.length === 0 ? (
          <p className={styles.dim}>
            No click signals fired against this resolution.
          </p>
        ) : (
          <ul
            className={styles.interactionList}
            data-testid="context-pulls-drawer-interactions"
          >
            {detail.interactions.map((i) => (
              <li key={i.interaction_id} className={styles.interactionRow}>
                <span className={styles.clickKindChip}>{i.click_kind}</span>{' '}
                <code>{i.source_ref}</code>{' '}
                <span className={styles.dim}>
                  weight={i.click_weight.toFixed(2)} at{' '}
                  {formatTs(i.detected_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {detail.linked_resolutions.length > 0 && (
        <section className={styles.drawerSection}>
          <h3 className={styles.drawerSectionHeading}>
            Linked resolutions ({detail.linked_resolutions.length})
          </h3>
          <ul data-testid="context-pulls-drawer-linked-resolutions">
            {detail.linked_resolutions.map((r) => (
              <li key={r.resolution_id} className={styles.linkedResolution}>
                <span className={styles.entityKindBadge}>{r.entity_kind}</span>{' '}
                <code>{r.entity_slug}</code>{' '}
                <span className={styles.dim}>({r.outcome_kind})</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={styles.drawerSection}>
        <Link
          to={detail.trajectory_deep_link}
          className={styles.trajectoryLink}
          data-testid="context-pulls-drawer-trajectory-link"
        >
          → Full trajectory ({detail.trajectory_deep_link})
        </Link>
      </section>
    </>
  )
}

function DetectionContextBlock({ detail }: { detail: ContextPullDetail }) {
  return (
    <div data-testid="context-pulls-drawer-detection">
      <p className={styles.detectionToken}>
        <code>{detail.detection.token === '' ? '—' : detail.detection.token}</code>
      </p>
      <div className={styles.drawerRow}>
        <span className={styles.drawerLabel}>shape</span>
        <ShapeBadge shape={detail.detection.shape} />
      </div>
      <div className={styles.drawerRow}>
        <span className={styles.drawerLabel}>method</span>
        <code>{detail.detection.detection_method}</code>
      </div>
      <div className={styles.drawerRow}>
        <span className={styles.drawerLabel}>confidence</span>
        <span>{detail.detection.confidence.toFixed(2)}</span>
      </div>
      <div className={styles.drawerRow}>
        <span className={styles.drawerLabel}>span</span>
        <span>
          [{detail.detection.start_pos}, {detail.detection.end_pos})
        </span>
      </div>
      {detail.detection.source_message_excerpt !== null ? (
        <pre className={styles.detectionExcerpt}>
          {detail.detection.source_message_excerpt}
        </pre>
      ) : (
        <p
          className={styles.forwardFillNote}
          data-testid="context-pulls-drawer-excerpt-absent"
        >
          Source message excerpt unavailable — transcript-reader not yet
          wired (forward-fill caveat).
        </p>
      )}
    </div>
  )
}

function CandidateList({
  candidates,
}: {
  candidates: ContextPullDetail['candidates']
}) {
  if (candidates.length === 0) {
    return (
      <p className={styles.dim} data-testid="context-pulls-drawer-no-candidates">
        No candidates (no_hit).
      </p>
    )
  }
  return (
    <ol
      className={styles.candidateList}
      data-testid="context-pulls-drawer-candidates"
    >
      {candidates.map((c) => (
        <li key={`${c.position}-${c.source_ref}`} className={styles.candidate}>
          <span className={styles.candidatePosition}>#{c.position}</span>
          {c.source_type !== null && (
            <span className={styles.sourceTypePill}>{c.source_type}</span>
          )}
          <code className={styles.candidateRef}>{c.source_ref}</code>
          {c.title !== null && (
            <span className={styles.candidateTitle}>{c.title}</span>
          )}
          {c.score !== null && (
            <span className={styles.dim}>score={c.score.toFixed(2)}</span>
          )}
          {c.debug_notes !== null && (
            <span className={styles.dim}>{c.debug_notes}</span>
          )}
          <MlConfidenceCell value={c.ml_confidence_score} />
        </li>
      ))}
    </ol>
  )
}

function PresentedAsBlock({ text }: { text: string }) {
  function copy() {
    if (typeof navigator !== 'undefined' && navigator.clipboard !== undefined) {
      void navigator.clipboard.writeText(text).catch(() => {})
    }
  }
  return (
    <div className={styles.presentedAsBlock}>
      <div className={styles.drawerRow}>
        <span className={styles.drawerLabel}>presented_as</span>
        <button
          type="button"
          className={styles.copyBtn}
          onClick={copy}
          data-testid="context-pulls-drawer-copy-presented-as"
        >
          copy
        </button>
      </div>
      <pre className={styles.presentedAsText}>{text}</pre>
    </div>
  )
}

// --- atomic badges ---------------------------------------------------

function ConfidenceTierBadge({ tier }: { tier: string }) {
  return (
    <span
      className={`${styles.confidenceBadge} ${confidenceTierClass(tier)}`}
      data-confidence-tier={tier}
      data-testid={`context-pulls-confidence-${tier}`}
    >
      {tier}
    </span>
  )
}

function confidenceTierClass(tier: string): string {
  switch (tier) {
    case 'single_exact':
      return styles.confidenceSingleExact
    case 'fuzzy_multi':
      return styles.confidenceFuzzyMulti
    case 'weak_domain':
      return styles.confidenceWeakDomain
    case 'no_hit':
      return styles.confidenceNoHit
    default:
      return ''
  }
}

function ShapeBadge({ shape }: { shape: string }) {
  return (
    <span
      className={`${styles.shapeBadge} ${shapeCategoryClass(shape)}`}
      data-shape={shape}
      data-testid={`context-pulls-shape-${shape}`}
    >
      {shape}
    </span>
  )
}

// Map shape → category group for color-coding (RF1 §6.2).
function shapeCategoryClass(shape: string): string {
  if (
    shape === 'chain_slug' ||
    shape === 'task_slug' ||
    shape === 'bug_slug' ||
    shape === 'project_name'
  ) {
    return styles.shapeSlug
  }
  if (
    shape === 'path' ||
    shape === 'skill_name' ||
    shape === 'tool_name' ||
    shape === 'forge_schema'
  ) {
    return styles.shapeFilesystem
  }
  if (
    shape === 'library_entry' ||
    shape === 'domain_term' ||
    shape === 'vault_candidate' ||
    shape === 'kiwix_bridge' ||
    shape === 'memory_entry'
  ) {
    return styles.shapeKnowledge
  }
  if (shape === 'friction_shape') return styles.shapeFriction
  return styles.shapeExtension
}

function MlConfidenceCell({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <span
        className={`${styles.mlCell} ${styles.mlCellAbsent}`}
        data-testid="context-pulls-ml-absent"
        title="Not yet classified by T7 reranker"
      >
        —
      </span>
    )
  }
  return (
    <span
      className={`${styles.mlCell} ${mlConfidenceClass(value)}`}
      data-testid="context-pulls-ml-present"
      data-ml-score={value}
    >
      {value.toFixed(2)}
    </span>
  )
}

function mlConfidenceClass(score: number): string {
  if (score >= 0.8) return styles.mlHigh
  if (score >= 0.5) return styles.mlMid
  return styles.mlLow
}

// --- formatters ------------------------------------------------------

function formatTs(iso: string): string {
  const m = iso.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/)
  return m !== null ? m[1].replace('T', ' ') : iso
}
