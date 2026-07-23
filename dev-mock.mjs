// Development API stub.
//
// Default:       node dev-mock.mjs
//   Returns empty-but-valid responses for all endpoints — simulates a
//   server connected to a real (empty) DB. The UI loads, all pages render,
//   but lists are empty.
//
// Dummy-data mode:  node dev-mock.mjs --dummy
//   Returns hardcoded sample chains and tool-health entries so you can
//   exercise the full UI without a running DB.
//
// In both modes it listens on 3001 — the dashboard's own default API base —
// so plain `npm run dev` finds it with no env set. To run it beside a real
// toolkit-server already holding 3001, give it a port and point Vite at it:
//   PORT=3099 node dev-mock.mjs --dummy
//   VITE_API_BASE_URL=http://localhost:3099 npm run dev

import { createServer } from 'node:http'

const DUMMY = process.argv.includes('--dummy')

// Port defaults to the dashboard's own default API base (src/lib/http.ts),
// so `node dev-mock.mjs` + `npm run dev` need no env at all. Override with
// PORT to run the mock beside a real toolkit-server that already holds 3001.
const PORT = Number(process.env.PORT ?? 3001)
const ORIGIN = `http://localhost:${PORT}`

// ---------------------------------------------------------------------------
// Dummy data
// ---------------------------------------------------------------------------

const DUMMY_CHAINS = [
  {
    slug: 'work-port-tier2-reads',
    status: 'open',
    tasks_total: 3,
    tasks_pending: 2,
    tasks_closed: 0,
    tasks_cancelled: 0,
    updated_at: '2026-04-25T01:00:00Z',
  },
  {
    slug: 'work-port-nav-validation',
    status: 'open',
    tasks_total: 3,
    tasks_pending: 1,
    tasks_closed: 2,
    tasks_cancelled: 0,
    updated_at: '2026-04-24T18:30:00Z',
  },
  {
    slug: 'work-port-planning',
    status: 'open',
    tasks_total: 3,
    tasks_pending: 3,
    tasks_closed: 0,
    tasks_cancelled: 0,
    updated_at: '2026-04-23T10:00:00Z',
  },
  {
    slug: 'mcp-servers-migration',
    status: 'closed',
    tasks_total: 3,
    tasks_pending: 0,
    tasks_closed: 3,
    tasks_cancelled: 0,
    updated_at: '2026-04-20T09:00:00Z',
  },
  {
    slug: 'establish-conventions',
    status: 'closed',
    tasks_total: 3,
    tasks_pending: 0,
    tasks_closed: 2,
    tasks_cancelled: 1,
    updated_at: '2026-04-18T14:00:00Z',
  },
]

// The consolidated /chains endpoint returns a bare ChainRow[] (the
// generated Go shape — src/api/types.gen.ts), not the { chains: [...] }
// wrapper the older /chains/status serves. Derived from DUMMY_CHAINS so
// the two surfaces can never disagree.
const DUMMY_CHAIN_ROWS = DUMMY_CHAINS.map((chain, i) => ({
  id: i + 1,
  project_id: 'corpos-toolkit',
  slug: chain.slug,
  status: chain.status,
  total_tasks: chain.tasks_total,
  pending: chain.tasks_pending,
  active: 0,
  blocked: 0,
  closed: chain.tasks_closed,
  cancelled: chain.tasks_cancelled,
  updated_at: chain.updated_at,
}))

// Feeds the shell's project picker (src/api/admin.ts listProjects).
const DUMMY_PROJECTS = [
  {
    id: 'corpos-toolkit',
    name: 'Corpos Toolkit',
    path: '/home/user/dev/corpos-toolkit',
    created_at: '2026-05-05 16:08:52',
  },
  {
    id: 'corpos',
    name: 'Corpos',
    path: '/home/user/dev/corpos',
    created_at: '2026-05-05 16:08:52',
  },
]

const DUMMY_CHAIN_STATES = {
  'work-port-tier2-reads': {
    found: true,
    chain_slug: 'work-port-tier2-reads',
    chain_path: null,
    tasks: [
      { order: 1, slug: 'port-get-chain-state', status: 'active', problem_statement: 'Port get_chain_state to work-server end-to-end: handler, skill, all three harness layers, fresh-session pass, and benchmark baseline.' },
      { order: 2, slug: 'view-get-chain-state', status: 'pending', problem_statement: 'Build the task/chain index page in the dashboard querying work-server\'s get_chain_state endpoint.' },
      { order: 3, slug: 'port-chain-status', status: 'pending', problem_statement: 'Port chain_status to work-server: returns a summary of all chains with task counts.' },
    ],
    output: 'Four DB-backed read handlers and a live task/chain index page.',
    design_decisions: 'Reuse SqlitePool from T13.',
    completion_condition: 'All four Tier 2 DB read tools ported and pages live.',
  },
  'work-port-nav-validation': {
    found: true,
    chain_slug: 'work-port-nav-validation',
    chain_path: null,
    tasks: [
      { order: 1, slug: 'port-validate-filename', status: 'closed', problem_statement: 'Port validate_filename to work-server: checks process-doc filename convention.' },
      { order: 2, slug: 'port-check-lifecycle-change', status: 'closed', problem_statement: 'Port check_lifecycle_change to work-server: checks file-path lifecycle rules.' },
      { order: 3, slug: 'port-check-file-sizes', status: 'pending', problem_statement: 'Port check_file_sizes to work-server: scans for module-size violations.' },
    ],
    output: 'Three validation handlers with full harness.',
    design_decisions: 'Pure string/filesystem ops, no DB.',
    completion_condition: 'All three tools pass all harness layers.',
  },
  'work-port-planning': {
    found: true,
    chain_slug: 'work-port-planning',
    chain_path: null,
    tasks: [
      { order: 1, slug: 'scope-planning-tools', status: 'pending', problem_statement: 'Audit planning tools, confirm scope, and document any prerequisite data dependencies.' },
      { order: 2, slug: 'port-plan-generate', status: 'pending', problem_statement: 'Port plan_generate to work-server: generates a tiered context load plan for a session.' },
      { order: 3, slug: 'port-plan-describe', status: 'pending', problem_statement: 'Port plan_describe to work-server: describes the contents of a workflow or plan.' },
    ],
    output: 'Planning tool handlers ported.',
    design_decisions: 'Port after Tier 2 reads are stable.',
    completion_condition: 'All planning tools with full harness coverage.',
  },
  'mcp-servers-migration': {
    found: true,
    chain_slug: 'mcp-servers-migration',
    chain_path: null,
    tasks: [
      { order: 1, slug: 'classify-tool-surface', status: 'closed', problem_statement: 'Classify all 78 Work tools into four target server buckets and four migration tiers.' },
      { order: 2, slug: 'scaffold-frontend', status: 'closed', problem_statement: 'Scaffold the dashboard app: Vite + React + CSS modules, AppShell, sidebar, theme toggle.' },
      { order: 3, slug: 'first-tool-port', status: 'closed', problem_statement: 'Port read_task to work-server end-to-end as the pattern-setting first DB-backed tool.' },
    ],
    output: 'Foundation complete.',
    design_decisions: 'rmcp + sqlx + Vite + CSS modules.',
    completion_condition: 'All 78 Work tools ported.',
  },
  'establish-conventions': {
    found: true,
    chain_slug: 'establish-conventions',
    chain_path: null,
    tasks: [
      { order: 1, slug: 'write-conventions-doc', status: 'closed', problem_statement: 'Write CONVENTIONS.md as the authoritative reference for file layout, lint gates, and error enum shape.' },
      { order: 2, slug: 'add-lint-gates', status: 'closed', problem_statement: 'Add structure-lint checks that enforce the conventions at pre-commit time.' },
      { order: 3, slug: 'add-error-enum-shape', status: 'cancelled', problem_statement: 'Document the error enum shape convention as a standalone section — cancelled, covered by lint gate.' },
    ],
    output: 'CONVENTIONS.md written and enforced.',
    design_decisions: 'Cancelled error-enum-shape — covered by existing lint gate.',
    completion_condition: 'CONVENTIONS.md is the authoritative reference.',
  },
}

const DUMMY_BUG_DETAILS = {
  'task-row-not-highlighted': {
    slug: 'task-row-not-highlighted',
    title: 'Task row not highlighted after Work Search navigation',
    problem_statement: 'After navigating to a task via the Work Search "Go to planning dash" button, the corresponding task row in the planning dash is not highlighted.',
    surface: 'dashboard',
    severity: 'medium',
    source: 'playwright-session',
    acceptance_criteria: 'Row is highlighted on selection regardless of navigation path (direct click vs. URL param).',
    constraints: 'Must not break existing row selection logic.',
    status: 'fixed',
    resolution_note: 'Fixed by reading ?task= URL param on mount and triggering setSelectedTask.',
    routed_chain_slug: '',
    routed_task_slug: '',
    filed_at: '2026-04-24T10:00:00Z',
    resolved_at: '2026-04-24T12:00:00Z',
    resolved_commit_sha: 'abc1234',
    resolved_dirty: false,
    spawned_successor_slug: null,
    recurrence_candidates: null,
    resolution_kind: null,
  },
  'center-column-clips-problem-statement': {
    slug: 'center-column-clips-problem-statement',
    title: 'Center column clips problem statement text in planning dash',
    problem_statement: 'The center column in the planning dash clips long problem statement text instead of allowing it to wrap.',
    surface: 'dashboard',
    severity: 'low',
    source: 'manual-review',
    acceptance_criteria: 'Problem statement text wraps fully without clipping.',
    constraints: '',
    status: 'fixed',
    resolution_note: 'Added word-break: break-word to the task list item styles.',
    routed_chain_slug: '',
    routed_task_slug: '',
    filed_at: '2026-04-23T09:00:00Z',
    resolved_at: '2026-04-23T14:00:00Z',
    resolved_commit_sha: 'def5678',
    resolved_dirty: false,
    spawned_successor_slug: null,
    recurrence_candidates: null,
    resolution_kind: null,
  },
  'dummy-search-not-working': {
    slug: 'dummy-search-not-working',
    title: 'Dummy task search not returning results in dev mode',
    problem_statement: 'Task content search returns empty results in dev-mock mode even when a matching pattern is entered.',
    surface: 'dashboard,dev',
    severity: 'medium',
    source: 'dev-session',
    acceptance_criteria: 'Search returns matches from dummy task data in dev-mock mode.',
    constraints: 'Dev-only fix — must not affect production code paths.',
    status: 'fixed',
    resolution_note: 'Extended handleTaskSearch in dev-mock.mjs to search across all content fields.',
    routed_chain_slug: '',
    routed_task_slug: '',
    filed_at: '2026-04-22T11:00:00Z',
    resolved_at: '2026-04-22T16:00:00Z',
    resolved_commit_sha: 'ghi9012',
    resolved_dirty: false,
    spawned_successor_slug: null,
    recurrence_candidates: null,
    resolution_kind: null,
  },
  'l1-snapshot-wrong-path': {
    slug: 'l1-snapshot-wrong-path',
    title: 'L1 insta snapshot fails on first run due to missing snap file',
    problem_statement: 'The Layer 1 snapshot test fails on first run because the snap file is not committed alongside the test, causing CI to fail on clean checkouts.',
    surface: 'smoke-tests',
    severity: 'low',
    source: 'ci',
    acceptance_criteria: 'Snapshot passes on first run on clean checkout. CI does not require snap file to be pre-committed.',
    constraints: '',
    status: 'fixed',
    resolution_note: 'Switched from insta snapshots to inline assertions in smoke-tests/src/lib.rs.',
    routed_chain_slug: '',
    routed_task_slug: '',
    filed_at: '2026-04-20T08:00:00Z',
    resolved_at: '2026-04-20T09:00:00Z',
    resolved_commit_sha: 'jkl3456',
    resolved_dirty: false,
    spawned_successor_slug: null,
    recurrence_candidates: null,
    resolution_kind: null,
  },
  'missing-blurb-on-test-items': {
    slug: 'missing-blurb-on-test-items',
    title: 'Test Display page shows no blurb for several unit tests',
    problem_statement: 'Several unit tests are missing @blurb annotations, so the Test Display detail panel shows nothing when they are selected.',
    surface: 'dashboard,test-display',
    severity: 'low',
    source: 'manual-review',
    acceptance_criteria: 'All unit tests have @blurb annotations. Test Display panel shows a blurb for every test.',
    constraints: '',
    status: 'open',
    resolution_note: '',
    routed_chain_slug: '',
    routed_task_slug: '',
    filed_at: '2026-04-25T08:00:00Z',
    resolved_at: null,
    resolved_commit_sha: null,
    resolved_dirty: null,
    spawned_successor_slug: null,
    recurrence_candidates: null,
    resolution_kind: null,
  },
}

const DUMMY_BUGS = [
  {
    slug: 'task-row-not-highlighted',
    title: 'Task row not highlighted after Work Search navigation',
    status: 'fixed',
    surface: 'dashboard',
    severity: 'medium',
    filed_at: '2026-04-24T10:00:00Z',
    resolved_at: '2026-04-24T12:00:00Z',
  },
  {
    slug: 'center-column-clips-problem-statement',
    title: 'Center column clips problem statement text in planning dash',
    status: 'fixed',
    surface: 'dashboard',
    severity: 'low',
    filed_at: '2026-04-23T09:00:00Z',
    resolved_at: '2026-04-23T14:00:00Z',
  },
  {
    slug: 'dummy-search-not-working',
    title: 'Dummy task search not returning results in dev mode',
    status: 'fixed',
    surface: 'dashboard,dev',
    severity: 'medium',
    filed_at: '2026-04-22T11:00:00Z',
    resolved_at: '2026-04-22T16:00:00Z',
  },
  {
    slug: 'l1-snapshot-wrong-path',
    title: 'L1 insta snapshot fails on first run due to missing snap file',
    status: 'fixed',
    surface: 'smoke-tests',
    severity: 'low',
    filed_at: '2026-04-20T08:00:00Z',
    resolved_at: '2026-04-20T09:00:00Z',
  },
  {
    slug: 'missing-blurb-on-test-items',
    title: 'Test Display page shows no blurb for several unit tests',
    status: 'open',
    surface: 'dashboard,test-display',
    severity: 'low',
    filed_at: '2026-04-25T08:00:00Z',
    resolved_at: null,
  },
]

// Study runs (Assays page). GET /study-runs → bare array of summaries;
// GET /study-runs/<run_id> → summary + provenance + scores.
const DUMMY_ASSAYS = [
  {
    run_id: 'sr-1',
    name: 'casg-direct-v3-smoke',
    assay: 'grounded-glyph-probe',
    item_id: 'casg-direct',
    image_ref: 'localhost/lab-grounded-glyph-probe:dev',
    image_digest: 'sha256:4fe91f54ce7f0a1b2c3d4e5f60718293a4b5c6d7e8f90112',
    model_id: 'Qwen2.5-32B-Instruct-Q4_K_M.gguf',
    model_version: 'q4km',
    status: 'completed',
    error: '',
    run_at: '2026-07-09T00:33:10Z',
  },
  {
    run_id: 'sr-2',
    name: 'casg-direct-regression',
    assay: 'grounded-glyph-probe',
    item_id: 'casg-direct',
    image_ref: 'localhost/lab-grounded-glyph-probe:dev',
    image_digest: 'sha256:deadbeefcafe0011223344556677889900aabbccddeeff00',
    model_id: 'Qwen2.5-32B-Instruct-Q4_K_M.gguf',
    model_version: 'q4km',
    status: 'failed',
    error: 'container exited with code 1: OOM during scoring pass',
    run_at: '2026-07-09T01:12:00Z',
  },
  {
    run_id: 'sr-3',
    name: 'affect-mirror-baseline',
    assay: 'affect-mirror-probe',
    item_id: 'affect-mirror',
    image_ref: 'localhost/lab-affect-mirror-probe:dev',
    image_digest: 'sha256:11aa22bb33cc44dd55ee66ff778899aabbccddeeff0011223',
    model_id: 'Qwen2.5-14B-Instruct-Q5_K_M.gguf',
    model_version: 'q5km',
    status: 'completed',
    error: '',
    run_at: '2026-07-08T22:04:41Z',
  },
]

const DUMMY_ASSAY_DETAILS = {
  'sr-1': {
    ...DUMMY_ASSAYS[0],
    study_digest: 'abc123def4567890fedcba0987654321',
    materials_hashes: {
      'scenario.md': 'h1a2b3c4d5e6f7',
      'glyph.md': 'h4c5d6e7f8a9b0',
    },
    responses_dir: '/abs/out/responses/sr-1',
    scores: [
      { condition: 'baseline', run: 1, verdict_kind: 'fail', verdict_reason: 'no glyph produced', item: 'casg-direct', rationale: 'grounded-glyph-probe:baseline:response=2249chars' },
      { condition: 'baseline', run: 2, verdict_kind: 'fail', verdict_reason: 'no glyph produced', item: 'casg-direct', rationale: 'grounded-glyph-probe:baseline:response=1980chars' },
      { condition: 'grounded_glyph', run: 1, verdict_kind: 'pass', verdict_reason: '', item: 'casg-direct', rationale: 'grounded-glyph-probe:grounded_glyph:response=3102chars' },
      { condition: 'grounded_glyph', run: 2, verdict_kind: 'pass_with_condition', verdict_reason: 'partial grounding', item: 'casg-direct', rationale: 'grounded-glyph-probe:grounded_glyph:response=2874chars' },
    ],
  },
  'sr-2': {
    ...DUMMY_ASSAYS[1],
    study_digest: '',
    materials_hashes: {},
    responses_dir: '',
    scores: [],
  },
  'sr-3': {
    ...DUMMY_ASSAYS[2],
    study_digest: '99887766554433221100ffeeddccbbaa',
    materials_hashes: {
      'scenario.md': 'a9b8c7d6e5f4',
      'affect.md': 'f4e5d6c7b8a9',
    },
    responses_dir: '/abs/out/responses/sr-3',
    scores: [
      { condition: 'baseline', run: 1, verdict_kind: 'flag', verdict_reason: 'ambiguous', item: 'affect-mirror', rationale: 'affect-mirror-probe:baseline' },
      { condition: 'mirrored', run: 1, verdict_kind: 'pass', verdict_reason: '', item: 'affect-mirror', rationale: 'affect-mirror-probe:mirrored' },
      { condition: 'deferred_case', run: 1, verdict_kind: 'deferred', verdict_reason: 'needs human', item: 'affect-mirror', rationale: 'affect-mirror-probe:deferred_case' },
    ],
  },
}

const DUMMY_TOOLS = [
  {
    tool_name: 'get_chain_state',
    total_invocations: 42,
    bugs_opened: 1,
    bug_rate: 0.024,
    early_ok_rate: 0.95,
    recent_ok_rate: 0.98,
    window_days: 30,
  },
  {
    tool_name: 'read_task',
    total_invocations: 118,
    bugs_opened: 0,
    bug_rate: 0,
    early_ok_rate: 1.0,
    recent_ok_rate: 1.0,
    window_days: 30,
  },
  {
    tool_name: 'ping',
    total_invocations: 9,
    bugs_opened: 0,
    bug_rate: 0,
    early_ok_rate: null,
    recent_ok_rate: null,
    window_days: 30,
  },
  {
    tool_name: 'chain_status',
    total_invocations: 29,
    bugs_opened: 0,
    bug_rate: 0,
    early_ok_rate: 1.0,
    recent_ok_rate: 1.0,
    window_days: 30,
  },
  {
    tool_name: 'find_chain',
    total_invocations: 51,
    bugs_opened: 1,
    bug_rate: 0.02,
    early_ok_rate: 0.97,
    recent_ok_rate: 0.99,
    window_days: 30,
  },
  {
    tool_name: 'suggest_tools',
    total_invocations: 67,
    bugs_opened: 3,
    bug_rate: 0.045,
    early_ok_rate: 0.88,
    recent_ok_rate: 0.81,
    window_days: 30,
  },
]

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

function handleChainsStatus() {
  return { chains: DUMMY ? DUMMY_CHAINS : [] }
}

function handleChainState(slug) {
  if (!DUMMY) {
    return { found: false, chain_slug: slug, error: 'no database connected — run with --dummy for sample data' }
  }
  return DUMMY_CHAIN_STATES[slug] ?? { found: false, chain_slug: slug, error: 'chain not found' }
}

function handleChainsFind(query, includeClosedParam) {
  if (!query) return { found: false, query: '', results: [], note: 'No chains matched.' }
  const includeClosed = includeClosedParam !== 'false'
  const tokens = query.toLowerCase().split(/[\s\-_]+/).filter(Boolean)
  const candidates = includeClosed ? DUMMY_CHAINS : DUMMY_CHAINS.filter(c => c.status !== 'closed')
  const results = candidates
    .map(c => {
      const slug = c.slug.toLowerCase()
      const matched = tokens.filter(t => slug.includes(t)).length
      if (matched === 0) return null
      let score = matched / tokens.length
      const normalized = tokens.join('-')
      if (slug === normalized) score += 0.5
      else if (slug.startsWith(normalized)) score += 0.25
      return { slug: c.slug, status: c.status, tasks_total: c.tasks_total, tasks_closed: c.tasks_closed, score: Math.round(score * 1000) / 1000 }
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug))
  if (results.length === 0) return { found: false, query, results: [], note: 'No chains matched.' }
  return { found: true, query, results }
}

function handleToolsHealth(windowDays) {
  if (!DUMMY) return { tools: [] }
  return { tools: DUMMY_TOOLS.map(t => ({ ...t, window_days: windowDays })) }
}

function handleBugRead(slug) {
  if (!DUMMY) return { error: 'no database connected — run with --dummy for sample data' }
  const detail = DUMMY_BUG_DETAILS[slug]
  if (!detail) return { error: `bug '${slug}' not found` }
  return detail
}

function handleBugsList(status, surface, severity) {
  let bugs = DUMMY ? [...DUMMY_BUGS] : []
  if (status) bugs = bugs.filter(b => b.status === status)
  if (severity) bugs = bugs.filter(b => b.severity === severity)
  if (surface) {
    const tokens = surface.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
    bugs = bugs.filter(b =>
      tokens.some(t => b.surface.toLowerCase().includes(t))
    )
  }
  return { bugs, count: bugs.length }
}

function handleAssays(assay, status) {
  let runs = DUMMY ? [...DUMMY_ASSAYS] : []
  if (assay) runs = runs.filter(r => r.assay === assay)
  if (status) runs = runs.filter(r => r.status === status)
  // Bare JSON array — matches the observe study_runs list contract.
  return runs
}

function handleAssayDetail(runId) {
  if (!DUMMY) return { error: 'no database connected — run with --dummy for sample data' }
  return DUMMY_ASSAY_DETAILS[runId] ?? { error: `study run '${runId}' not found` }
}

function handleProjectStats() {
  if (!DUMMY) {
    return {
      total_files: 0,
      total_directories: 0,
      breakdown: {},
    }
  }
  return {
    total_files: 1247,
    total_directories: 89,
    breakdown: {
      'process-docs/': { files: 43, subdirs: 7 },
      'process-docs/glyph-model/': { files: 12, subdirs: 0 },
      'process-docs/mcp-servers-migration/': { files: 8, subdirs: 0 },
      'tools/': { files: 3, subdirs: 14 },
      'tools/seed-mcp/': { files: 6, subdirs: 4 },
      'tools/map-generator/': { files: 4, subdirs: 1 },
      'skills/': { files: 31, subdirs: 1 },
      'blueprints/': { files: 18, subdirs: 2 },
      'workflows/': { files: 14, subdirs: 1 },
    },
  }
}

function handleTaskSearch(pattern, maxResults) {
  if (!pattern) return { count: 0, truncated: false, pattern, matches: [] }
  const patLower = pattern.toLowerCase()
  const matches = []
  const statusFor = Object.fromEntries(DUMMY_CHAINS.map(c => [c.slug, c.status]))
  for (const [chainSlug, state] of Object.entries(DUMMY_CHAIN_STATES)) {
    for (const task of state.tasks) {
      const fields = [
        ['problem_statement', task.problem_statement ?? ''],
      ]
      for (const [field, val] of fields) {
        if (!val.toLowerCase().includes(patLower)) continue
        const idx = val.toLowerCase().indexOf(patLower)
        const start = Math.max(0, idx - 40)
        const end = Math.min(val.length, idx + pattern.length + 40)
        const snippet = (start > 0 ? '…' : '') + val.slice(start, end) + (end < val.length ? '…' : '')
        matches.push({
          chain_slug: chainSlug,
          chain_status: statusFor[chainSlug] ?? 'open',
          task_slug: task.slug,
          task_status: task.status,
          field,
          snippet,
        })
        if (matches.length >= maxResults) {
          return { count: matches.length, truncated: true, pattern, matches }
        }
      }
    }
  }
  return { count: matches.length, truncated: false, pattern, matches }
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')

  const url = new URL(req.url, ORIGIN)

  // SSE stream. The dashboard's useEventBus opens EventSource(/events);
  // the Assays page refetches on `assay_recorded`. Emit one every ~4s so
  // the page visibly live-updates in --dummy mode. Kept minimal — the
  // page reads only the event tag, not the payload.
  if (url.pathname === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    res.write(': connected\n\n')
    let n = 0
    const timer = setInterval(() => {
      n += 1
      const runId = DUMMY_ASSAYS[n % DUMMY_ASSAYS.length].run_id
      const payload = { event: 'assay_recorded', project_id: 'corpos-lab', run_id: runId }
      res.write(`data: ${JSON.stringify(payload)}\n\n`)
    }, 4000)
    req.on('close', () => clearInterval(timer))
    return
  }

  res.setHeader('Content-Type', 'application/json')

  // Study run detail: GET /study-runs/<run_id>
  if (url.pathname.startsWith('/study-runs/')) {
    const runId = decodeURIComponent(url.pathname.slice('/study-runs/'.length))
    res.writeHead(200)
    res.end(JSON.stringify(handleAssayDetail(runId)))
    return
  }

  // Study run list: GET /study-runs
  if (url.pathname === '/study-runs') {
    const assay = url.searchParams.get('assay') ?? ''
    const status = url.searchParams.get('status') ?? ''
    res.writeHead(200)
    res.end(JSON.stringify(handleAssays(assay || null, status || null)))
    return
  }

  // The consolidated list endpoint the dashboard's listChains() calls.
  // Registered before /chains/status only for readability — the checks
  // are exact-match, so order carries no meaning here.
  if (url.pathname === '/chains') {
    const includeClosed = url.searchParams.get('include_closed') === 'true'
    let rows = DUMMY ? DUMMY_CHAIN_ROWS : []
    if (!includeClosed) rows = rows.filter(chain => chain.status !== 'closed')
    res.writeHead(200)
    res.end(JSON.stringify(rows))
    return
  }

  if (url.pathname === '/projects') {
    res.writeHead(200)
    res.end(JSON.stringify(DUMMY ? DUMMY_PROJECTS : []))
    return
  }

  if (url.pathname === '/chains/status') {
    res.writeHead(200)
    res.end(JSON.stringify(handleChainsStatus()))
    return
  }

  if (url.pathname === '/chains/state') {
    const slug = url.searchParams.get('chain_slug') ?? ''
    res.writeHead(200)
    res.end(JSON.stringify(handleChainState(slug)))
    return
  }

  if (url.pathname === '/chains/find') {
    const query = url.searchParams.get('query') ?? ''
    const includeClosed = url.searchParams.get('include_closed') ?? 'true'
    res.writeHead(200)
    res.end(JSON.stringify(handleChainsFind(query, includeClosed)))
    return
  }

  if (url.pathname === '/tools/health') {
    const windowDays = Number(url.searchParams.get('window') ?? 30)
    res.writeHead(200)
    res.end(JSON.stringify(handleToolsHealth(windowDays)))
    return
  }

  if (url.pathname === '/bugs/read') {
    const slug = url.searchParams.get('slug') ?? ''
    res.writeHead(200)
    res.end(JSON.stringify(handleBugRead(slug)))
    return
  }

  if (url.pathname === '/bugs/list') {
    const status   = url.searchParams.get('status') ?? ''
    const surface  = url.searchParams.get('surface') ?? ''
    const severity = url.searchParams.get('severity') ?? ''
    res.writeHead(200)
    res.end(JSON.stringify(handleBugsList(status || null, surface || null, severity || null)))
    return
  }

  if (url.pathname === '/tasks/search') {
    const pattern = url.searchParams.get('pattern') ?? ''
    const maxResults = Number(url.searchParams.get('max_results') ?? 50)
    res.writeHead(200)
    res.end(JSON.stringify(handleTaskSearch(pattern, maxResults)))
    return
  }

  if (url.pathname === '/project/stats') {
    res.writeHead(200)
    res.end(JSON.stringify(handleProjectStats()))
    return
  }

  if (url.pathname === '/knowledge/index-card') {
    res.writeHead(200)
    res.end(JSON.stringify({
      total_active_pointers: 0,
      by_source_type: [],
      pending_curation_candidates: 0,
      top_queried: [],
      recently_added: [],
      grounding_summary: {
        total_search_calls: 0,
        used_count: 0,
        used_pct: 0,
        zero_result_gap_count: 0,
        pure_memory_sessions: 0,
      },
    }))
    return
  }

  res.writeHead(404)
  res.end(JSON.stringify({ error: 'not found' }))
})

server.listen(PORT, () => {
  if (DUMMY) {
    console.log(`mock API → ${ORIGIN}  [--dummy mode]`)
    console.log('chains : work-port-tier2-reads, work-port-nav-validation,')
    console.log('         work-port-planning, mcp-servers-migration, establish-conventions')
    console.log('tools  : get_chain_state, read_task, ping, chain_status, find_chain, suggest_tools')
  } else {
    console.log(`mock API → ${ORIGIN}  [empty mode — add --dummy for sample data]`)
  }
  console.log()
  console.log(`VITE_API_BASE_URL=${ORIGIN} npm run dev`)
})
