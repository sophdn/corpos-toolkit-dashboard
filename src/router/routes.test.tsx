import type { ReactElement } from 'react'
import type { RouteObject } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { routes } from './routes'
import { ActionDocsPage } from '../pages/ActionDocs'
import { AdminDispatchPolicyPage } from '../pages/AdminDispatchPolicy'
import { AssaysPage } from '../pages/Assays'
import { AuditLedgerPage } from '../pages/AuditLedger'
import { BenchmarksPage } from '../pages/Benchmarks'
import { BugIndexPage } from '../pages/BugIndex'
import { ChainIndexPage } from '../pages/ChainIndex'
import { ContextPullInspector } from '../pages/ContextPulls'
import { DeferredPortsPage } from '../pages/DeferredPorts'
import { InferencePage } from '../pages/Inference'
import { KnowledgePage } from '../pages/Knowledge'
import { MemorySubstratePage } from '../pages/MemorySubstrate'
import { ModelRankingPage } from '../pages/ModelRanking'
import { QueryTrajectoryViewPage } from '../pages/QueryTrajectoryView'
import { RoadmapPage } from '../pages/Roadmap'
import { SnapshotCorpusPage } from '../pages/SnapshotCorpus'
import { SpansPanel } from '../pages/Spans'
import { SuggestionIndexPage } from '../pages/SuggestionIndex'
import { TelemetryAnalyticsPage } from '../pages/Telemetry'
import { TrainingPairsBrowser } from '../pages/TrainingPairs'

// CHARACTERIZATION NET — chain telemetry-page-ia-unification (Chain 4), refactor
// step 2. This pins the CURRENT route → page-component mapping (the information
// architecture this chain reorganizes) so the IA delta is explicit and reviewable.
// The per-page render tests + the Go endpoint goldens are the DATA-parity oracle
// (they must stay green across the refactor); THIS file is the structure-parity
// snapshot — when a route is renamed/moved/added by the vetted IA change, the
// expected mapping here is updated in the same commit, and the diff is the record
// of exactly what moved. See docs/CHAIN4_PAGE_IA_INVENTORY.md.

const rootRoute = routes[0]
const children = (rootRoute.children ?? []) as RouteObject[]

function routeFor(path: string): RouteObject | undefined {
  return children.find((r) => r.path === path)
}

function componentOf(route: RouteObject | undefined) {
  // The route element is a JSX element; its `.type` is the page component
  // function — assert by reference identity (robust to renames of the symbol's
  // display string).
  return (route?.element as ReactElement | undefined)?.type
}

describe('router IA — current route → page-component mapping', () => {
  // Acceptance classes: every concrete route resolves to its page component.
  it.each([
    ['tasks/chains', ChainIndexPage],
    ['roadmap', RoadmapPage],
    ['bugs', BugIndexPage],
    ['suggestions', SuggestionIndexPage],
    ['benchmarks', BenchmarksPage],
    ['assays', AssaysPage],
    ['deferred-ports', DeferredPortsPage],
    ['knowledge', KnowledgePage],
    ['knowledge/memory-substrate', MemorySubstratePage],
    ['inference', InferencePage],
    ['spans', SpansPanel],
    ['audit', AuditLedgerPage],
    ['telemetry', TelemetryAnalyticsPage],
    ['telemetry/model-ranking', ModelRankingPage],
    ['telemetry/training-pairs', TrainingPairsBrowser],
    ['telemetry/snapshot-corpus', SnapshotCorpusPage],
    ['context-pulls', ContextPullInspector],
    ['telemetry/trajectories/:queryId', QueryTrajectoryViewPage],
    ['admin/dispatch-policy', AdminDispatchPolicyPage],
    ['docs/actions', ActionDocsPage],
    ['docs/actions/:surface', ActionDocsPage],
    ['docs/actions/:surface/:action', ActionDocsPage],
  ])('route %s renders the expected page component', (path, expected) => {
    expect(componentOf(routeFor(path))).toBe(expected)
  })

  it('pins the full set of concrete route paths (no silent add/drop)', () => {
    const paths = children
      .filter((r) => typeof r.path === 'string')
      .map((r) => r.path)
      .sort()
    expect(paths).toEqual(
      [
        'tasks/chains',
        'roadmap',
        'bugs',
        'suggestions',
        'benchmarks',
        'assays',
        'deferred-ports',
        'knowledge',
        'knowledge/memory-substrate',
        'inference',
        'spans',
        'audit',
        'telemetry',
        'telemetry/model-ranking',
        'telemetry/training-pairs',
        'telemetry/snapshot-corpus',
        'context-pulls',
        'telemetry/trajectories/:queryId',
        'admin',
        'admin/dispatch-policy',
        'docs/actions',
        'docs/actions/:surface',
        'docs/actions/:surface/:action',
        '*',
      ].sort(),
    )
  })
})

describe('router IA — redirect (boundary/rejection) routes', () => {
  async function redirectTarget(route: RouteObject | undefined): Promise<string | null> {
    const loader = route?.loader
    if (typeof loader !== 'function') return null
    // react-router's redirect() returns a Response carrying Location.
    const res = (await (loader as (args: unknown) => unknown)({
      request: new Request('http://localhost/'),
      params: {},
    })) as Response
    return res.headers.get('Location')
  }

  it('index route redirects to /tasks/chains', async () => {
    const idx = children.find((r) => r.index)
    expect(await redirectTarget(idx)).toBe('/tasks/chains')
  })

  it('bare /admin redirects to /admin/dispatch-policy', async () => {
    expect(await redirectTarget(routeFor('admin'))).toBe('/admin/dispatch-policy')
  })

  it('unknown path (*) redirects to /tasks/chains', async () => {
    expect(await redirectTarget(routeFor('*'))).toBe('/tasks/chains')
  })
})
