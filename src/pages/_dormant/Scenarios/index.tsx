import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getScenarios } from '../../api/scenarios'
import { KNOWN_TOOLS } from '../../lib/benchmarks'
import {
  CORPUS_LAYERS,
  filterScenarios,
  groupByToolThenLayer,
  type CorpusLayer,
  type LayerFilter,
  type L4ScenarioEntry,
  type L5ScenarioEntry,
  type L6ScenarioEntry,
  type ScenarioEntry,
} from '../../lib/scenarios'
import styles from './Scenarios.module.css'

// ── Helpers ───────────────────────────────────────────────────────────────────

const LAYER_OPTIONS: { id: LayerFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'l4',  label: 'L4 — arg accuracy' },
  { id: 'l5',  label: 'L5 — interpretation' },
  { id: 'l6',  label: 'L6 — negative cases' },
]

const LAYER_FILTER_VALUES: readonly LayerFilter[] = ['all', ...CORPUS_LAYERS] as const

function isLayerFilter(v: string | null): v is LayerFilter {
  return v != null && (LAYER_FILTER_VALUES as readonly string[]).includes(v)
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function ScenariosPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  // Read initial filter state from URL params (deep-link support).
  const initialLayer = searchParams.get('layer')
  const initialTool  = searchParams.get('tool') ?? 'all'
  const initialQuery = searchParams.get('q') ?? ''

  const [layer, setLayer]           = useState<LayerFilter>(isLayerFilter(initialLayer) ? initialLayer : 'all')
  const [tool, setTool]             = useState<string>(initialTool)
  const [searchText, setSearchText] = useState<string>(initialQuery)

  const [entries, setEntries] = useState<ScenarioEntry[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Sync URL params whenever filter state changes (back/forward survives).
  useEffect(() => {
    const next = new URLSearchParams()
    if (layer !== 'all')      next.set('layer', layer)
    if (tool !== 'all')       next.set('tool', tool)
    if (searchText.trim() !== '') next.set('q', searchText.trim())
    setSearchParams(next, { replace: true })
  }, [layer, tool, searchText, setSearchParams])

  // Fetch the corpus on mount; refetches only on layer/tool (server filter).
  // searchText filters client-side.
  useEffect(() => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setLoading(true)
    setError(null)

    const fetchParams: { layer?: CorpusLayer; tool?: string } = {}
    if (layer !== 'all') fetchParams.layer = layer
    if (tool !== 'all')  fetchParams.tool  = tool

    getScenarios(fetchParams, ctrl.signal)
      .then(data => {
        if (ctrl.signal.aborted) return
        setEntries(data.scenarios)
        setLoading(false)
      })
      .catch((err: Error) => {
        if (err.name !== 'AbortError') {
          setError(err.message)
          setLoading(false)
        }
      })

    return () => ctrl.abort()
  }, [layer, tool])

  const filtered = entries == null
    ? []
    : filterScenarios(entries, 'all', 'all', searchText) // server already narrowed by layer/tool
  const grouped  = groupByToolThenLayer(filtered)

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Scenarios</h1>
        <p className={styles.subtitle}>
          Corpus of L4 / L5 / L6 benchmark scenarios.{' '}
          <a
            className={styles.layersLink}
            href="https://github.com/anthropics/claude-code"
            onClick={e => { e.preventDefault() /* placeholder for in-repo LAYERS.md link */ }}
            data-testid="scenarios-layers-link"
          >
            What do the layers mean?
          </a>
        </p>
      </div>

      <div className={styles.filters}>
        <div className={styles.layerToggles} data-testid="scenarios-layer-toggles">
          {LAYER_OPTIONS.map(opt => (
            <button
              key={opt.id}
              className={`${styles.layerToggle} ${layer === opt.id ? styles['layerToggle--active'] : ''}`}
              onClick={() => setLayer(opt.id)}
              aria-pressed={layer === opt.id}
              data-testid="scenarios-layer-toggle"
              data-layer={opt.id}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <select
          className={styles.toolSelect}
          value={tool}
          onChange={e => setTool(e.target.value)}
          aria-label="Filter by tool"
          data-testid="scenarios-tool-select"
        >
          <option value="all">All tools</option>
          {KNOWN_TOOLS.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <input
          type="search"
          className={styles.searchInput}
          placeholder="Search prompts / questions / answers / args…"
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          aria-label="Search scenarios"
          data-testid="scenarios-search"
        />
      </div>

      {loading && <div className={styles.state}>Loading…</div>}
      {error   && <div className={styles.state} data-testid="scenarios-error">{error}</div>}

      {!loading && !error && (
        <div className={styles.results} data-testid="scenarios-results">
          <div className={styles.resultMeta} data-testid="scenarios-count">
            {filtered.length} scenario{filtered.length === 1 ? '' : 's'} matching
          </div>
          {grouped.length === 0 ? (
            <div className={styles.empty} data-testid="scenarios-empty">
              No scenarios match the current filters.
            </div>
          ) : (
            grouped.map(group => (
              <section
                key={group.tool}
                className={styles.toolGroup}
                data-testid="scenarios-tool-group"
                data-tool={group.tool}
              >
                <h2 className={styles.toolHeading}>{group.tool}</h2>
                {group.byLayer.map(layerGroup => (
                  <div
                    key={layerGroup.layer}
                    className={styles.layerGroup}
                    data-testid="scenarios-layer-group"
                    data-layer={layerGroup.layer}
                  >
                    <h3 className={styles.layerHeading}>
                      {layerGroup.layer.toUpperCase()} ({layerGroup.entries.length})
                    </h3>
                    <ul className={styles.entryList}>
                      {layerGroup.entries.map(entry => (
                        <ScenarioCard key={entry.id} entry={entry} />
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ── Per-entry render (one component per layer's distinct shape) ──────────────

function ScenarioCard({ entry }: { entry: ScenarioEntry }) {
  return (
    <li
      className={styles.entryCard}
      data-testid="scenarios-entry"
      data-id={entry.id}
      data-layer={entry.layer}
      data-tool={entry.tool_name}
    >
      <div className={styles.entryHeader}>
        <code className={styles.entryId}>{entry.id}</code>
      </div>
      {entry.layer === 'l4' && <L4EntryBody entry={entry} />}
      {entry.layer === 'l5' && <L5EntryBody entry={entry} />}
      {entry.layer === 'l6' && <L6EntryBody entry={entry} />}
    </li>
  )
}

function L4EntryBody({ entry }: { entry: L4ScenarioEntry }) {
  return (
    <>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>prompt</span>
        <span className={styles.fieldValue}>{entry.user_prompt}</span>
      </div>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>expected_args</span>
        {entry.expected_args.length === 0 ? (
          <span className={styles.fieldValueMuted}>(none)</span>
        ) : (
          <ul className={styles.argsList}>
            {entry.expected_args.map(arg => (
              <li key={arg.name} className={styles.argItem}>
                <code className={styles.argName}>{arg.name}</code>{' '}
                <span className={styles.argKind}>[{arg.kind}]</span>
                {arg.value != null && <> = <code className={styles.argValue}>"{arg.value}"</code></>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}

function L5EntryBody({ entry }: { entry: L5ScenarioEntry }) {
  return (
    <>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>tool_output</span>
        <pre className={styles.toolOutput} data-testid="scenarios-tool-output">{entry.tool_output}</pre>
      </div>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>question</span>
        <span className={styles.fieldValue}>{entry.question}</span>
      </div>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>expected_answer</span>
        <code className={styles.expectedAnswer}>"{entry.expected_answer}"</code>
      </div>
    </>
  )
}

function L6EntryBody({ entry }: { entry: L6ScenarioEntry }) {
  const decision = entry.expected_decision
  return (
    <>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>prompt</span>
        <span className={styles.fieldValue}>{entry.user_prompt}</span>
      </div>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>expected_decision</span>
        <span
          className={`${styles.decisionBadge} ${styles[`decision--${decision.kind}`] ?? ''}`}
          data-testid="scenarios-decision-badge"
          data-kind={decision.kind}
        >
          {decision.kind === 'no_tool' && 'NoTool'}
          {decision.kind === 'ask_for_clarification' && 'AskForClarification'}
          {decision.kind === 'route_to' && (
            <>
              RouteTo(<code className={styles.routeTarget}>{decision.route_to}</code>)
            </>
          )}
        </span>
      </div>
    </>
  )
}
