import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  type TrainingPairsFilters,
  getTrainingPairs,
  getTrainingPairsStats,
} from '../../api/telemetry'
import type {
  LabelKind,
  TrainingPairItem,
  TrainingPairsResponse,
  TrainingPairsStatsResponse,
} from '../../lib/telemetry'
import { LABEL_KINDS, QUERY_SOURCES } from '../../lib/telemetry'
import styles from './TrainingPairs.module.css'

/**
 * TrainingPairsBrowser — read-only browser for proj_training_data_for_reranker
 * (QF5). An ML pipeline author validates the corpus here before training:
 * label_kind distribution, source-shape balance, label_sources audit per
 * row.
 *
 * Three-axis discipline (TELEMETRY_FRONTEND §2):
 *   - label_kind axis: the 5-value enum from TT1.5 §5; weakly_positive
 *     renders DISTINCTLY from positive in both badge color and copy
 *     (the spike's motivation was that the signal strengths differ).
 *   - query_source axis: who initiated the upstream search
 *   - source_type axis: candidate-side knowledge_pointer kind
 * The browser surfaces all three distributions in the stats banner and
 * exposes label_kind + query_source as filters.
 */

const PAGE_SIZE = 50

interface FilterState {
  labelKind: string[]
  querySource: string[]
  q: string
  project: string | null
}

function parseRepeated(searchParams: URLSearchParams, key: string): string[] {
  return searchParams.getAll(key)
}

export function TrainingPairsBrowser() {
  const [searchParams, setSearchParams] = useSearchParams()
  const state: FilterState = useMemo(
    () => ({
      labelKind: parseRepeated(searchParams, 'label_kind'),
      querySource: parseRepeated(searchParams, 'query_source'),
      q: searchParams.get('q') ?? '',
      project: searchParams.get('project'),
    }),
    [searchParams],
  )

  function updateFilters(patch: Partial<FilterState>) {
    const next = { ...state, ...patch }
    const params = new URLSearchParams()
    for (const v of next.labelKind) params.append('label_kind', v)
    for (const v of next.querySource) params.append('query_source', v)
    if (next.q !== '') params.set('q', next.q)
    if (next.project !== null && next.project !== '')
      params.set('project', next.project)
    setSearchParams(params, { replace: true })
  }

  const apiFilters: TrainingPairsFilters = {
    label_kind: state.labelKind.length > 0 ? state.labelKind : undefined,
    query_source: state.querySource.length > 0 ? state.querySource : undefined,
    project: state.project ?? undefined,
    q: state.q !== '' ? state.q : undefined,
    limit: PAGE_SIZE,
  }

  return (
    <div className={styles.page} data-testid="training-pairs-page">
      <header className={styles.header}>
        <h2 className={styles.title}>Training Pairs</h2>
        <p className={styles.subtitle}>
          Spot-check the reranker training corpus before training.
        </p>
      </header>

      <StatsBanner filters={apiFilters} />
      <FilterBar state={state} onChange={updateFilters} />
      <PairList filters={apiFilters} />
    </div>
  )
}

// --- stats banner ----------------------------------------------------

function StatsBanner({ filters }: { filters: TrainingPairsFilters }) {
  const [stats, setStats] = useState<TrainingPairsStatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (abortRef.current !== null) abortRef.current.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    setError(null)
    getTrainingPairsStats(
      {
        label_kind: filters.label_kind,
        query_source: filters.query_source,
        project: filters.project,
      },
      ctrl.signal,
    )
      .then((resp) => {
        setStats(resp)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return
        setError(err instanceof Error ? err.message : 'unknown error')
        setLoading(false)
      })
    return () => ctrl.abort()
  }, [
    filters.label_kind?.join(','),
    filters.query_source?.join(','),
    filters.project,
  ])

  if (loading) {
    return (
      <section
        className={styles.statsBanner}
        data-testid="training-pairs-stats-loading"
        aria-busy="true"
      >
        <p className={styles.placeholder}>Loading corpus stats…</p>
      </section>
    )
  }
  if (error !== null) {
    return (
      <section
        className={styles.statsBanner}
        data-testid="training-pairs-stats-error"
      >
        <p className={styles.error} role="alert">
          Stats unavailable: {error}
        </p>
      </section>
    )
  }
  if (stats === null) return null

  return (
    <section
      className={styles.statsBanner}
      data-testid="training-pairs-stats"
      aria-labelledby="training-pairs-stats-heading"
    >
      <h3 id="training-pairs-stats-heading" className={styles.statsHeading}>
        Corpus shape — {stats.total_pairs} pair{stats.total_pairs === 1 ? '' : 's'}
        {stats.total_pairs === 0 && (
          <span className={styles.forwardFillNote}>
            {' '}
            (substrate may be empty — see forward-fill caveat)
          </span>
        )}
      </h3>
      <div className={styles.statsGrid}>
        <LabelKindMiniBar
          counts={stats.by_label_kind}
          total={stats.total_pairs}
        />
        <DistributionList
          axis="query_source"
          counts={stats.by_query_source}
          enumOrder={QUERY_SOURCES}
        />
        <DistributionList axis="action" counts={stats.by_action} />
      </div>
    </section>
  )
}

function LabelKindMiniBar({
  counts,
  total,
}: {
  counts: Record<string, number>
  total: number
}) {
  return (
    <div
      className={styles.miniBar}
      data-testid="training-pairs-label-kind-bar"
      role="img"
      aria-label="label_kind distribution"
    >
      <h4 className={styles.distHeading}>label_kind</h4>
      <div className={styles.miniBarRow}>
        {LABEL_KINDS.map((kind) => {
          const n = counts[kind] ?? 0
          const pct = total === 0 ? 0 : (n / total) * 100
          return (
            <div
              key={kind}
              className={styles.miniBarCell}
              data-label-kind={kind}
              data-count={n}
              data-testid={`training-pairs-label-kind-${kind}`}
            >
              <span className={labelKindBadgeClass(kind)}>{kind}</span>
              <span className={styles.miniBarCount}>{n}</span>
              <div
                className={styles.miniBarFill}
                style={{ width: `${pct}%` }}
                aria-hidden
              />
            </div>
          )
        })}
      </div>
    </div>
  )
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
  const entries = enumOrder !== undefined
    ? enumOrder.map((k) => [k, counts[k] ?? 0] as [string, number])
    : Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))
  return (
    <div className={styles.distList} data-testid={`training-pairs-dist-${axis}`}>
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

// --- filter bar ------------------------------------------------------

function FilterBar({
  state,
  onChange,
}: {
  state: FilterState
  onChange: (patch: Partial<FilterState>) => void
}) {
  return (
    <form
      className={styles.filterBar}
      role="search"
      data-testid="training-pairs-filters"
      onSubmit={(e) => e.preventDefault()}
    >
      <MultiSelect
        label="label_kind"
        options={LABEL_KINDS}
        selected={state.labelKind}
        testid="training-pairs-filter-label-kind"
        onChange={(vals) => onChange({ labelKind: vals })}
      />
      <MultiSelect
        label="query_source"
        options={QUERY_SOURCES}
        selected={state.querySource}
        testid="training-pairs-filter-query-source"
        onChange={(vals) => onChange({ querySource: vals })}
      />
      <label className={styles.searchLabel}>
        <span>Query text contains</span>
        <input
          type="search"
          value={state.q}
          onChange={(e) => onChange({ q: e.target.value })}
          data-testid="training-pairs-filter-q"
          placeholder="free-text search…"
        />
      </label>
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

// --- pair list -------------------------------------------------------

function PairList({ filters }: { filters: TrainingPairsFilters }) {
  const [data, setData] = useState<TrainingPairsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (abortRef.current !== null) abortRef.current.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    setError(null)
    getTrainingPairs(filters, ctrl.signal)
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
  }, [
    filters.label_kind?.join(','),
    filters.query_source?.join(','),
    filters.project,
    filters.q,
  ])

  if (loading && data === null) {
    return (
      <p className={styles.placeholder} data-testid="training-pairs-loading">
        Loading training pairs…
      </p>
    )
  }
  if (error !== null) {
    return (
      <p className={styles.error} role="alert" data-testid="training-pairs-error">
        {error}
      </p>
    )
  }
  if (data === null || data.items.length === 0) {
    return (
      <p className={styles.empty} data-testid="training-pairs-empty">
        No training pairs match these filters.
      </p>
    )
  }

  return (
    <ol
      className={styles.pairList}
      role="list"
      data-testid="training-pairs-list"
    >
      {data.items.map((item) => (
        <li key={item.training_id} className={styles.pairCard}>
          <PairCard item={item} />
        </li>
      ))}
    </ol>
  )
}

function PairCard({ item }: { item: TrainingPairItem }) {
  return (
    <article
      data-testid={`training-pair-${item.training_id}`}
      className={styles.pairCardInner}
    >
      <div className={styles.pairTop}>
        <span className={labelKindBadgeClass(item.label_kind)}>
          {item.label_kind}
        </span>
        <span className={styles.weight}>weight={item.weight.toFixed(2)}</span>
        {item.label_sources.length > 0 && (
          <ul className={styles.labelSources} role="list">
            {item.label_sources.map((src) => (
              <li key={src} className={styles.labelSourceChip}>
                {src}
              </li>
            ))}
          </ul>
        )}
        <Link
          to={`/telemetry/trajectories/${item.grounding_event_id}`}
          className={styles.trajLink}
          data-testid={`training-pair-${item.training_id}-trajectory`}
        >
          → trajectory
        </Link>
      </div>
      {item.query_text !== null && item.query_text !== '' && (
        <p className={styles.queryText} data-testid={`training-pair-${item.training_id}-query`}>
          {item.query_text}
        </p>
      )}
      <p className={styles.candidate}>
        candidate: <code>{item.source_ref}</code>{' '}
        <span className={styles.candidateMeta}>
          pos={item.candidate_position}{' '}
          {item.candidate_pointer_id !== null
            ? `pointer=${item.candidate_pointer_id}`
            : '(pointer retired)'}
        </span>
      </p>
    </article>
  )
}

// --- atoms ------------------------------------------------------------

function labelKindBadgeClass(kind: string): string {
  switch (kind as LabelKind) {
    case 'positive':
      return `${styles.labelKindBadge} ${styles.labelKindPositive}`
    case 'weakly_positive':
      return `${styles.labelKindBadge} ${styles.labelKindWeaklyPositive}`
    case 'negative':
      return `${styles.labelKindBadge} ${styles.labelKindNegative}`
    case 'hard_negative':
      return `${styles.labelKindBadge} ${styles.labelKindHardNegative}`
    case 'unlabeled':
      return `${styles.labelKindBadge} ${styles.labelKindUnlabeled}`
    default:
      return styles.labelKindBadge
  }
}
