import { act, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type ActionDocsResponse, getActionDocs } from '../../api/actionDocs'
import { ActionDocsPage } from '.'

vi.mock('../../api/actionDocs', async () => {
  const actual = await vi.importActual<typeof import('../../api/actionDocs')>(
    '../../api/actionDocs',
  )
  return {
    ...actual,
    getActionDocs: vi.fn(),
  }
})

const mockGet = vi.mocked(getActionDocs)

beforeEach(() => {
  mockGet.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

const fixtureCorpus: ActionDocsResponse = {
  count: 4,
  surfaces: ['admin', 'work'],
  actions: {
    admin: {
      health: {
        surface: 'admin',
        action: 'health',
        purpose: 'Liveness probe.',
      },
    },
    work: {
      _general: {
        surface: 'work',
        action: '_general',
        purpose: 'Work surface conventions.',
      },
      bug_read: {
        surface: 'work',
        action: 'bug_read',
        purpose: 'Read one bug.',
      },
      bug_resolve: {
        surface: 'work',
        action: 'bug_resolve',
        purpose: 'Resolve a bug.',
        params: [
          {
            name: 'slug',
            type: 'string',
            required: true,
            description: 'Bug slug',
          },
        ],
        param_aliases: [{ from: 'id', to: 'slug' }],
        value_aliases: [{ param: 'resolution_kind', from: 'fix', to: 'fixed' }],
        errors: [{ condition: 'not_found', message: 'bug missing' }],
        examples: [
          { description: 'Resolve as fixed', call: "{slug: 'b1', kind: 'fixed'}" },
        ],
        notes: 'Mutating; rationale enforcement applies.',
      },
    },
  },
  write_actions: {
    'work.bug_resolve': true,
  },
  corpus_path: 'embedded',
  parse_errors: [],
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/docs/actions" element={<ActionDocsPage />} />
        <Route path="/docs/actions/:surface" element={<ActionDocsPage />} />
        <Route path="/docs/actions/:surface/:action" element={<ActionDocsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ActionDocsPage — load states', () => {
  it('renders the loading placeholder while fetching', async () => {
    let resolve!: (v: ActionDocsResponse) => void
    mockGet.mockReturnValueOnce(new Promise((r) => { resolve = r }))
    renderAt('/docs/actions')
    expect(screen.getByTestId('action-docs-loading')).toBeInTheDocument()
    await act(async () => {
      resolve(fixtureCorpus)
    })
  })

  it('renders an error message with role=alert when fetch fails', async () => {
    mockGet.mockRejectedValueOnce(new Error('boom'))
    renderAt('/docs/actions')
    await waitFor(() =>
      expect(screen.getByTestId('action-docs-error')).toHaveTextContent('boom'),
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('renders the empty-state when the corpus is empty', async () => {
    mockGet.mockResolvedValueOnce({
      count: 0,
      surfaces: [],
      actions: {},
      write_actions: {},
      corpus_path: '',
      parse_errors: [],
    })
    renderAt('/docs/actions')
    await waitFor(() =>
      expect(screen.getByTestId('action-docs-empty')).toBeInTheDocument(),
    )
  })
})

describe('ActionDocsPage — listing', () => {
  it('renders a tab per surface, defaulting to the alphabetically-first', async () => {
    mockGet.mockResolvedValueOnce(fixtureCorpus)
    renderAt('/docs/actions')
    await waitFor(() =>
      expect(screen.getByTestId('action-docs-tab-admin')).toBeInTheDocument(),
    )
    expect(screen.getByTestId('action-docs-tab-work')).toBeInTheDocument()
    expect(screen.getByTestId('action-docs-list-admin')).toBeInTheDocument()
    expect(screen.queryByTestId('action-docs-list-work')).toBeNull()
  })

  it('routes /docs/actions/:surface to that surface tab active', async () => {
    mockGet.mockResolvedValueOnce(fixtureCorpus)
    renderAt('/docs/actions/work')
    await waitFor(() =>
      expect(screen.getByTestId('action-docs-list-work')).toBeInTheDocument(),
    )
    expect(screen.queryByTestId('action-docs-list-admin')).toBeNull()
  })

  it('sorts _general to the top of its surface, other actions alphabetical', async () => {
    mockGet.mockResolvedValueOnce(fixtureCorpus)
    renderAt('/docs/actions/work')
    await waitFor(() =>
      expect(screen.getByTestId('action-docs-list-work')).toBeInTheDocument(),
    )
    const list = screen.getByTestId('action-docs-list-work')
    const rows = within(list).getAllByRole('listitem')
    expect(rows[0]).toHaveAttribute('data-action-key', 'work._general')
    expect(rows[1]).toHaveAttribute('data-action-key', 'work.bug_read')
    expect(rows[2]).toHaveAttribute('data-action-key', 'work.bug_resolve')
  })

  it('renders read / write / rationale chips per row', async () => {
    mockGet.mockResolvedValueOnce(fixtureCorpus)
    renderAt('/docs/actions/work')
    await waitFor(() =>
      expect(screen.getByTestId('action-docs-row-work-bug_resolve')).toBeInTheDocument(),
    )
    const writeRow = screen.getByTestId('action-docs-row-work-bug_resolve')
    expect(within(writeRow).getByText('write')).toBeInTheDocument()
    expect(within(writeRow).getByText('rationale')).toBeInTheDocument()

    const readRow = screen.getByTestId('action-docs-row-work-bug_read')
    expect(within(readRow).getByText('read')).toBeInTheDocument()
    expect(within(readRow).queryByText('rationale')).toBeNull()
  })
})

describe('ActionDocsPage — detail view', () => {
  it('renders every TOML section for a fully-populated chunk', async () => {
    mockGet.mockResolvedValueOnce(fixtureCorpus)
    renderAt('/docs/actions/work/bug_resolve')
    await waitFor(() =>
      expect(
        screen.getByTestId('action-docs-detail-work-bug_resolve'),
      ).toBeInTheDocument(),
    )
    expect(screen.getByText('Purpose')).toBeInTheDocument()
    expect(screen.getByText('Parameters')).toBeInTheDocument()
    expect(screen.getByText('Param aliases')).toBeInTheDocument()
    expect(screen.getByText('Value aliases')).toBeInTheDocument()
    expect(screen.getByText('Errors')).toBeInTheDocument()
    expect(screen.getByText('Examples')).toBeInTheDocument()
    expect(screen.getByText('Notes')).toBeInTheDocument()
    // Param row visible — scope to the table so we don't collide with
    // the same identifier inside the example code block.
    const paramTable = screen.getByTestId('action-docs-detail-params')
    expect(within(paramTable).getByText('slug')).toBeInTheDocument()
    // Example call rendered verbatim.
    expect(screen.getByText("{slug: 'b1', kind: 'fixed'}")).toBeInTheDocument()
  })

  it('omits sections that are absent from the chunk', async () => {
    mockGet.mockResolvedValueOnce(fixtureCorpus)
    renderAt('/docs/actions/admin/health')
    await waitFor(() =>
      expect(
        screen.getByTestId('action-docs-detail-admin-health'),
      ).toBeInTheDocument(),
    )
    expect(screen.getByText('Purpose')).toBeInTheDocument()
    // health has only purpose — every other section is omitted.
    expect(screen.queryByText('Parameters')).toBeNull()
    expect(screen.queryByText('Errors')).toBeNull()
    expect(screen.queryByText('Examples')).toBeNull()
    expect(screen.queryByText('Notes')).toBeNull()
  })

  it('shows kind=write and rationale=required chips on detail header for write actions', async () => {
    mockGet.mockResolvedValueOnce(fixtureCorpus)
    renderAt('/docs/actions/work/bug_resolve')
    await waitFor(() =>
      expect(screen.getByTestId('action-docs-detail-kind')).toHaveTextContent(
        'write',
      ),
    )
    expect(screen.getByTestId('action-docs-detail-rationale')).toHaveTextContent(
      'rationale required',
    )
  })

  it('shows kind=read and rationale=not-required chips for read actions', async () => {
    mockGet.mockResolvedValueOnce(fixtureCorpus)
    renderAt('/docs/actions/work/bug_read')
    await waitFor(() =>
      expect(screen.getByTestId('action-docs-detail-kind')).toHaveTextContent(
        'read',
      ),
    )
    expect(screen.getByTestId('action-docs-detail-rationale')).toHaveTextContent(
      'no rationale required',
    )
  })

  it('renders an empty-state when the routed action has no chunk', async () => {
    mockGet.mockResolvedValueOnce(fixtureCorpus)
    renderAt('/docs/actions/work/nonexistent_action')
    await waitFor(() =>
      expect(
        screen.getByTestId('action-docs-detail-missing'),
      ).toBeInTheDocument(),
    )
  })
})

describe('ActionDocsPage — cross-link to dispatch policy', () => {
  it('detail-view policy link targets /admin/dispatch-policy#<surface>.<action>', async () => {
    mockGet.mockResolvedValueOnce(fixtureCorpus)
    renderAt('/docs/actions/work/bug_resolve')
    await waitFor(() =>
      expect(
        screen.getByTestId('action-docs-detail-policy-link'),
      ).toBeInTheDocument(),
    )
    const link = screen.getByTestId('action-docs-detail-policy-link')
    expect(link).toHaveAttribute(
      'href',
      '/admin/dispatch-policy#work.bug_resolve',
    )
  })
})

describe('ActionDocsPage — accessibility', () => {
  it('renders the tab strip with role=tablist and tab/aria-selected per surface', async () => {
    mockGet.mockResolvedValueOnce(fixtureCorpus)
    renderAt('/docs/actions/work')
    await waitFor(() =>
      expect(screen.getByRole('tablist')).toBeInTheDocument(),
    )
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(2)
    const workTab = screen.getByTestId('action-docs-tab-work')
    expect(workTab).toHaveAttribute('aria-selected', 'true')
  })

  it('renders the parameter table as a semantic <table>', async () => {
    mockGet.mockResolvedValueOnce(fixtureCorpus)
    renderAt('/docs/actions/work/bug_resolve')
    await waitFor(() =>
      expect(screen.getByTestId('action-docs-detail-params')).toBeInTheDocument(),
    )
    expect(screen.getByRole('table')).toBeInTheDocument()
  })

  it('marks the active list row with aria-current=page', async () => {
    mockGet.mockResolvedValueOnce(fixtureCorpus)
    renderAt('/docs/actions/work/bug_resolve')
    await waitFor(() =>
      expect(screen.getByTestId('action-docs-row-work-bug_resolve')).toBeInTheDocument(),
    )
    const row = screen.getByTestId('action-docs-row-work-bug_resolve')
    const link = within(row).getByRole('link')
    expect(link).toHaveAttribute('aria-current', 'page')
  })
})

// Chain migrate-knowledge-action-docs-to-derive-contract T6 (frontend-serve-
// verify): the page is surface-agnostic (it renders whatever surface the
// /admin/action-docs payload carries), so the knowledge surface — whose corpus
// is now GENERATED from knowledge.knowledgeActionRegistry — renders through the
// same code path as work/admin. This fixture mirrors the shape the generated
// knowledge corpus serves, including the migration's DERIVED param types
// (curation_read.id is `integer`, derived from curationReadParams.ID int64 — the
// corrected cell) and parse_context's multi-example + notes. It is the jsdom
// render evidence for the visual-verify checklist
// (docs/KNOWLEDGE_ACTION_DOCS_FRONTEND_VERIFY_2026-05-25.md).
const knowledgeCorpus: ActionDocsResponse = {
  count: 3,
  surfaces: ['knowledge'],
  actions: {
    knowledge: {
      curation_read: {
        surface: 'knowledge',
        action: 'curation_read',
        purpose: 'Return the full candidate body for one curation_candidate.',
        params: [
          { name: 'id', type: 'integer', required: true, description: 'The candidate id.' },
        ],
      },
      vault_search: {
        surface: 'knowledge',
        action: 'vault_search',
        purpose: 'Rank notes from the vault via local Qwen.',
        params: [
          { name: 'query', type: 'string', required: true, description: 'Free-text search query.' },
          { name: 'top_k', type: 'integer', required: false, description: 'Number of top results.' },
        ],
      },
      parse_context: {
        surface: 'knowledge',
        action: 'parse_context',
        purpose: 'Canonical orienting call.',
        params: [
          { name: 'message_text', type: 'string', required: true, description: 'The user message.' },
        ],
        examples: [
          { description: 'Basic call', call: '{"action":"parse_context","params":{"message_text":"finish T8"}}' },
        ],
        notes: 'Shape coverage: chain_slug, task_slug, …',
      },
    },
  },
  write_actions: {},
  corpus_path: 'embedded',
  parse_errors: [],
}

describe('ActionDocsPage — knowledge surface (generated corpus)', () => {
  it('renders the knowledge tab from the payload surfaces', async () => {
    mockGet.mockResolvedValueOnce(knowledgeCorpus)
    renderAt('/docs/actions/knowledge')
    await waitFor(() =>
      expect(screen.getByTestId('action-docs-tab-knowledge')).toBeInTheDocument(),
    )
    expect(screen.getByTestId('action-docs-tab-knowledge')).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it("renders curation_read's DERIVED integer id param (the corrected cell)", async () => {
    mockGet.mockResolvedValueOnce(knowledgeCorpus)
    renderAt('/docs/actions/knowledge/curation_read')
    await waitFor(() =>
      expect(
        screen.getByTestId('action-docs-detail-knowledge-curation_read'),
      ).toBeInTheDocument(),
    )
    const paramTable = screen.getByTestId('action-docs-detail-params')
    expect(within(paramTable).getByText('id')).toBeInTheDocument()
    // The migration corrected this from a hand-authored "string" to the derived
    // "integer" (curationReadParams.ID int64); the page renders the derived type.
    expect(within(paramTable).getByText('integer')).toBeInTheDocument()
  })

  it('cross-links a knowledge action to its dispatch-policy anchor', async () => {
    mockGet.mockResolvedValueOnce(knowledgeCorpus)
    renderAt('/docs/actions/knowledge/curation_read')
    await waitFor(() =>
      expect(
        screen.getByTestId('action-docs-detail-policy-link'),
      ).toBeInTheDocument(),
    )
    expect(screen.getByTestId('action-docs-detail-policy-link')).toHaveAttribute(
      'href',
      '/admin/dispatch-policy#knowledge.curation_read',
    )
  })

  it("renders parse_context's examples + notes (struct-backed, multi-example)", async () => {
    mockGet.mockResolvedValueOnce(knowledgeCorpus)
    renderAt('/docs/actions/knowledge/parse_context')
    await waitFor(() =>
      expect(
        screen.getByTestId('action-docs-detail-knowledge-parse_context'),
      ).toBeInTheDocument(),
    )
    expect(screen.getByText('Examples')).toBeInTheDocument()
    expect(screen.getByText('Notes')).toBeInTheDocument()
  })
})

// Chain migrate-measure-action-docs-to-derive-contract T6 (frontend-serve-
// verify): the page is surface-agnostic, so the measure surface — whose corpus
// is now GENERATED from measure.measureActionRegistry — renders through the same
// code path as work/knowledge/admin. This fixture mirrors the shape the generated
// measure corpus serves, including the migration's single DERIVED/corrected param
// type (bench_run.override_flags is `object[]`, derived from
// benchRunParams.OverrideFlags []benchFlagPairCLI — the blessed delta), bench_run's
// Returns + Examples + rationale envelope, and a map-bound classify_* action with
// authored string params + Notes. It is the jsdom render evidence for the
// visual-verify checklist (docs/MEASURE_ACTION_DOCS_FRONTEND_VERIFY_2026-05-26.md).
const measureCorpus: ActionDocsResponse = {
  count: 3,
  surfaces: ['measure'],
  actions: {
    measure: {
      bench_run: {
        surface: 'measure',
        action: 'bench_run',
        purpose: 'Execute a registered bench harness subprocess and diff its output against the stored baseline.',
        params: [
          { name: 'slug', type: 'string', required: true, description: "The bench's slug." },
          { name: 'update_baseline', type: 'bool', required: false, description: 'Overwrite the baseline before diffing.' },
          { name: 'override_flags', type: 'object[]', required: false, description: 'List of {flag, value} entries.' },
        ],
        examples: [
          { description: 'Standard run', call: '{"action":"bench_run","params":{"slug":"parse-context"}}' },
        ],
        envelope_requirements: [
          { field: 'rationale', required: true, reason: 'Dispatcher policy gate.', applies_to_actor_kinds: ['agent'] },
        ],
        returns: { shape: 'BenchRunResult', description: 'Carries ok + slug + metrics[] + markdown_table.' },
      },
      classify_bug_severity: {
        surface: 'measure',
        action: 'classify_bug_severity',
        purpose: 'Dispatches the bug-severity rubric via Qwen.',
        params: [
          { name: 'bug_report', type: 'string', required: true, description: 'The filed bug report to classify.' },
        ],
        notes: 'Severity is two-axis (observer-impact × blast-radius).',
      },
    },
  },
  write_actions: {
    'measure.bench_run': true,
  },
  corpus_path: 'embedded',
  parse_errors: [],
}

describe('ActionDocsPage — measure surface (generated corpus)', () => {
  it('renders the measure tab from the payload surfaces', async () => {
    mockGet.mockResolvedValueOnce(measureCorpus)
    renderAt('/docs/actions/measure')
    await waitFor(() =>
      expect(screen.getByTestId('action-docs-tab-measure')).toBeInTheDocument(),
    )
    expect(screen.getByTestId('action-docs-tab-measure')).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it("renders bench_run's DERIVED override_flags object[] param (the blessed-delta cell)", async () => {
    mockGet.mockResolvedValueOnce(measureCorpus)
    renderAt('/docs/actions/measure/bench_run')
    await waitFor(() =>
      expect(
        screen.getByTestId('action-docs-detail-measure-bench_run'),
      ).toBeInTheDocument(),
    )
    const paramTable = screen.getByTestId('action-docs-detail-params')
    expect(within(paramTable).getByText('override_flags')).toBeInTheDocument()
    // The migration shifted this from the hand-authored "object" to the derived
    // "object[]" ([]benchFlagPairCLI); the page renders the derived type.
    expect(within(paramTable).getByText('object[]')).toBeInTheDocument()
  })

  it("renders bench_run's Returns + Examples (the one struct-backed measure action)", async () => {
    mockGet.mockResolvedValueOnce(measureCorpus)
    renderAt('/docs/actions/measure/bench_run')
    await waitFor(() =>
      expect(
        screen.getByTestId('action-docs-detail-measure-bench_run'),
      ).toBeInTheDocument(),
    )
    expect(screen.getByText('Returns')).toBeInTheDocument()
    expect(screen.getByText('Examples')).toBeInTheDocument()
    expect(screen.getByTestId('action-docs-detail-returns')).toHaveTextContent(
      'BenchRunResult',
    )
  })

  it('renders a map-bound classify_* action with authored string param + Notes', async () => {
    mockGet.mockResolvedValueOnce(measureCorpus)
    renderAt('/docs/actions/measure/classify_bug_severity')
    await waitFor(() =>
      expect(
        screen.getByTestId('action-docs-detail-measure-classify_bug_severity'),
      ).toBeInTheDocument(),
    )
    const paramTable = screen.getByTestId('action-docs-detail-params')
    expect(within(paramTable).getByText('bug_report')).toBeInTheDocument()
    expect(within(paramTable).getByText('string')).toBeInTheDocument()
    expect(screen.getByText('Notes')).toBeInTheDocument()
  })

  it('cross-links a measure action to its dispatch-policy anchor', async () => {
    mockGet.mockResolvedValueOnce(measureCorpus)
    renderAt('/docs/actions/measure/bench_run')
    await waitFor(() =>
      expect(
        screen.getByTestId('action-docs-detail-policy-link'),
      ).toBeInTheDocument(),
    )
    expect(screen.getByTestId('action-docs-detail-policy-link')).toHaveAttribute(
      'href',
      '/admin/dispatch-policy#measure.bench_run',
    )
  })
})

// Chain migrate-admin-action-docs-to-derive-contract T6 (frontend-serve-verify):
// the page is surface-agnostic (it renders whatever surface the
// /admin/action-docs payload carries), so the admin surface — whose corpus is
// now GENERATED from admin.adminActionRegistry — renders through the same code
// path as work/knowledge. admin was ALREADY a served+embedded surface, so the
// migration changed only the SOURCE of its corpus, not the payload shape; this
// fixture mirrors the shape the generated admin corpus serves, including the two
// DERIVED-param actions (vault_search_metrics.recent_n is `integer`, derived from
// vaultSearchMetricsParams.RecentN int64; action_describe.surface/action are
// `string`, derived from ActionDescribeParams — the dogfood action). admin
// introduced NO blessed delta. It is the jsdom render evidence for the
// visual-verify checklist
// (docs/ADMIN_ACTION_DOCS_FRONTEND_VERIFY_2026-05-26.md).
const adminCorpus: ActionDocsResponse = {
  count: 3,
  surfaces: ['admin'],
  actions: {
    admin: {
      vault_search_metrics: {
        surface: 'admin',
        action: 'vault_search_metrics',
        purpose: 'Return aggregate stats over recent vault_search invocations.',
        params: [
          {
            name: 'since',
            type: 'optional_string',
            required: false,
            description: 'Lower-bound timestamp.',
          },
          {
            name: 'recent_n',
            type: 'integer',
            required: false,
            description: 'Aggregate over the most recent N invocations.',
          },
        ],
      },
      action_describe: {
        surface: 'admin',
        action: 'action_describe',
        purpose: 'Return the per-action TOML chunk for one (surface, action) lookup.',
        params: [
          { name: 'surface', type: 'string', required: true, description: 'The meta-tool surface.' },
          { name: 'action', type: 'string', required: true, description: 'The action name.' },
        ],
        errors: [
          { condition: 'missing surface', message: 'action_describe: surface is required.' },
        ],
        examples: [
          { description: "Fetch a specific action's chunk.", call: '{surface: "work", action: "bug_resolve"}' },
        ],
        notes: 'Always-registered: part of admin.BuildTable regardless of corpus load.',
      },
      vault_integrity_sweep: {
        surface: 'admin',
        action: 'vault_integrity_sweep',
        purpose: 'Walk active vault pointers and orphan the ones whose file is missing.',
        notes: 'Mutating; rationale enforcement applies.',
      },
    },
  },
  write_actions: { 'admin.vault_integrity_sweep': true },
  corpus_path: 'embedded',
  parse_errors: [],
}

describe('ActionDocsPage — admin surface (generated corpus)', () => {
  it('renders the admin tab from the payload surfaces', async () => {
    mockGet.mockResolvedValueOnce(adminCorpus)
    renderAt('/docs/actions/admin')
    await waitFor(() =>
      expect(screen.getByTestId('action-docs-tab-admin')).toBeInTheDocument(),
    )
    expect(screen.getByTestId('action-docs-tab-admin')).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it("renders vault_search_metrics's DERIVED params (recent_n → integer)", async () => {
    mockGet.mockResolvedValueOnce(adminCorpus)
    renderAt('/docs/actions/admin/vault_search_metrics')
    await waitFor(() =>
      expect(
        screen.getByTestId('action-docs-detail-admin-vault_search_metrics'),
      ).toBeInTheDocument(),
    )
    const paramTable = screen.getByTestId('action-docs-detail-params')
    expect(within(paramTable).getByText('recent_n')).toBeInTheDocument()
    // recent_n's type derives from RecentN int64 → documented `integer`.
    expect(within(paramTable).getByText('integer')).toBeInTheDocument()
    // since derives from Since string (not required) → `optional_string`.
    expect(within(paramTable).getByText('optional_string')).toBeInTheDocument()
  })

  it('renders the action_describe dogfood action (derived params + errors + examples)', async () => {
    mockGet.mockResolvedValueOnce(adminCorpus)
    renderAt('/docs/actions/admin/action_describe')
    await waitFor(() =>
      expect(
        screen.getByTestId('action-docs-detail-admin-action_describe'),
      ).toBeInTheDocument(),
    )
    const paramTable = screen.getByTestId('action-docs-detail-params')
    expect(within(paramTable).getByText('surface')).toBeInTheDocument()
    expect(within(paramTable).getByText('action')).toBeInTheDocument()
    expect(screen.getByText('Errors')).toBeInTheDocument()
    expect(screen.getByText('Examples')).toBeInTheDocument()
  })

  it('cross-links an admin action to its dispatch-policy anchor', async () => {
    mockGet.mockResolvedValueOnce(adminCorpus)
    renderAt('/docs/actions/admin/vault_integrity_sweep')
    await waitFor(() =>
      expect(
        screen.getByTestId('action-docs-detail-policy-link'),
      ).toBeInTheDocument(),
    )
    expect(screen.getByTestId('action-docs-detail-policy-link')).toHaveAttribute(
      'href',
      '/admin/dispatch-policy#admin.vault_integrity_sweep',
    )
  })
})

// Chain migrate-ml-action-docs-to-derive-contract T6 (frontend-serve-verify):
// like work/knowledge, the ml surface's corpus is now GENERATED from
// ml.mlActionRegistry and renders through the same surface-agnostic page. This
// fixture mirrors the shape the generated ml corpus serves, including inference's
// DERIVED param types (model_id `integer` from InferenceParams.ModelID int64;
// features_data / features_shape `object[]` from []float32 / []int64) and the
// [returns] block (InferenceResult) — the first surface to exercise the Returns
// section in a render test. NOTE: the chain spec framed ml's docs as "new" (empty
// corpus); in fact inference had a hand-authored chunk whose params/returns/errors
// lived as PROSE in notes — this migration restructured them into the structured
// shape rendered here. jsdom render evidence for
// docs/ML_ACTION_DOCS_FRONTEND_VERIFY_2026-05-26.md.
const mlCorpus: ActionDocsResponse = {
  count: 2,
  surfaces: ['ml'],
  actions: {
    ml: {
      _general: {
        surface: 'ml',
        action: '_general',
        purpose: 'Trained-model inference.',
        notes: 'SURFACE BOUNDARY. ml inference happens here; lifecycle lives on work.',
      },
      inference: {
        surface: 'ml',
        action: 'inference',
        purpose:
          'Run inference against a trained_model. Accepts either model_id or task.',
        params: [
          { name: 'model_id', type: 'integer', required: false, description: 'trained_models.id; wins when both supplied.' },
          { name: 'task', type: 'optional_string', required: false, description: 'Task identifier (kebab-case).' },
          { name: 'features_data', type: 'object[]', required: true, description: 'Flattened input tensor ([]float32).' },
          { name: 'features_shape', type: 'object[]', required: true, description: 'Tensor shape ([]int64).' },
          { name: 'grounding_event_id', type: 'integer', required: false, description: 'grounding_events.id for search-triggered calls.' },
        ],
        errors: [
          { condition: 'neither model_id nor task supplied', message: 'ml.inference requires either model_id or task' },
          { condition: 'gated lifecycle state', message: 'ml: trained model is in a gated lifecycle state' },
        ],
        returns: {
          shape: 'InferenceResult',
          description:
            'prediction.output + output_shape; latency_ms; model_id; feat_hash; span_id; prediction_row_id.',
        },
        notes: 'MODEL RESOLUTION: model_id wins when both are supplied.',
      },
    },
  },
  write_actions: {},
  corpus_path: 'embedded',
  parse_errors: [],
}

describe('ActionDocsPage — ml surface (generated corpus)', () => {
  it('renders the ml tab from the payload surfaces', async () => {
    mockGet.mockResolvedValueOnce(mlCorpus)
    renderAt('/docs/actions/ml')
    await waitFor(() =>
      expect(screen.getByTestId('action-docs-tab-ml')).toBeInTheDocument(),
    )
    expect(screen.getByTestId('action-docs-tab-ml')).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it("renders inference's DERIVED param types (integer model_id, object[] tensors)", async () => {
    mockGet.mockResolvedValueOnce(mlCorpus)
    renderAt('/docs/actions/ml/inference')
    await waitFor(() =>
      expect(
        screen.getByTestId('action-docs-detail-ml-inference'),
      ).toBeInTheDocument(),
    )
    const paramTable = screen.getByTestId('action-docs-detail-params')
    expect(within(paramTable).getByText('model_id')).toBeInTheDocument()
    expect(within(paramTable).getByText('features_data')).toBeInTheDocument()
    // Types are DERIVED from InferenceParams, not hand-authored: model_id +
    // grounding_event_id derive `integer`; features_data + features_shape
    // ([]float32 / []int64) derive `object[]`.
    expect(within(paramTable).getAllByText('integer')).toHaveLength(2)
    expect(within(paramTable).getAllByText('object[]')).toHaveLength(2)
  })

  it("renders inference's [returns] block (InferenceResult) — the first surface to author one", async () => {
    mockGet.mockResolvedValueOnce(mlCorpus)
    renderAt('/docs/actions/ml/inference')
    await waitFor(() =>
      expect(
        screen.getByTestId('action-docs-detail-returns'),
      ).toBeInTheDocument(),
    )
    expect(screen.getByText('Returns')).toBeInTheDocument()
    const returns = screen.getByTestId('action-docs-detail-returns')
    expect(within(returns).getByText('InferenceResult')).toBeInTheDocument()
  })

  it("renders inference's Errors + Notes sections", async () => {
    mockGet.mockResolvedValueOnce(mlCorpus)
    renderAt('/docs/actions/ml/inference')
    await waitFor(() =>
      expect(
        screen.getByTestId('action-docs-detail-ml-inference'),
      ).toBeInTheDocument(),
    )
    expect(screen.getByText('Errors')).toBeInTheDocument()
    expect(screen.getByText('Notes')).toBeInTheDocument()
  })

  it('cross-links inference to its dispatch-policy anchor', async () => {
    mockGet.mockResolvedValueOnce(mlCorpus)
    renderAt('/docs/actions/ml/inference')
    await waitFor(() =>
      expect(
        screen.getByTestId('action-docs-detail-policy-link'),
      ).toBeInTheDocument(),
    )
    expect(screen.getByTestId('action-docs-detail-policy-link')).toHaveAttribute(
      'href',
      '/admin/dispatch-policy#ml.inference',
    )
  })
})

describe('ActionDocsPage — parse errors', () => {
  it('surfaces parse_errors as a collapsible banner', async () => {
    mockGet.mockResolvedValueOnce({
      ...fixtureCorpus,
      parse_errors: [
        { source_file: 'work/broken.toml', err: 'surface mismatch' },
      ],
    })
    renderAt('/docs/actions')
    await waitFor(() =>
      expect(
        screen.getByTestId('action-docs-parse-errors'),
      ).toBeInTheDocument(),
    )
    expect(screen.getByText(/1 chunk failed to load/)).toBeInTheDocument()
  })
})
