import type { RouteObject } from 'react-router-dom'
import { redirect } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { ActionDocsPage } from '../pages/ActionDocs'
import { AdminDispatchPolicyPage } from '../pages/AdminDispatchPolicy'
import { AuditLedgerPage } from '../pages/AuditLedger'
import { AssaysPage } from '../pages/Assays'
import { BenchmarksPage } from '../pages/Benchmarks'
import { BugIndexPage } from '../pages/BugIndex'
import { SuggestionIndexPage } from '../pages/SuggestionIndex'
import { DeferredPortsPage } from '../pages/DeferredPorts'
import { ChainIndexPage } from '../pages/ChainIndex'
import { ContextPullInspector } from '../pages/ContextPulls'
import { InferencePage } from '../pages/Inference'
import { KnowledgePage } from '../pages/Knowledge'
import { MemorySubstratePage } from '../pages/MemorySubstrate'
import { ModelRankingPage } from '../pages/ModelRanking'
import { QueryTrajectoryViewPage } from '../pages/QueryTrajectoryView'
import { RoadmapPage } from '../pages/Roadmap'
import { SnapshotCorpusPage } from '../pages/SnapshotCorpus'
import { SpansPanel } from '../pages/Spans'
import { TelemetryAnalyticsPage } from '../pages/Telemetry'
import { TrainingPairsBrowser } from '../pages/TrainingPairs'

// Dormant pages live under src/pages/_dormant/. See
// FRONTEND_CONVENTIONS.md → Routing → Dormant pages for the
// revival/retirement procedure.

// The route table is exported as plain data (not a constructed router) so it can
// be characterized in isolation — importing a `createBrowserRouter` result eagerly
// initializes navigation against the host history, which throws under jsdom. See
// router/routes.test.tsx (the IA characterization net for chain
// telemetry-page-ia-unification).
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, loader: () => redirect('/tasks/chains') },
      { path: 'tasks/chains', element: <ChainIndexPage /> },
      { path: 'roadmap', element: <RoadmapPage /> },
      { path: 'bugs', element: <BugIndexPage /> },
      { path: 'suggestions', element: <SuggestionIndexPage /> },
      { path: 'benchmarks', element: <BenchmarksPage /> },
      { path: 'assays', element: <AssaysPage /> },
      { path: 'deferred-ports', element: <DeferredPortsPage /> },
      { path: 'knowledge', element: <KnowledgePage /> },
      { path: 'knowledge/memory-substrate', element: <MemorySubstratePage /> },
      { path: 'inference', element: <InferencePage /> },
      { path: 'spans', element: <SpansPanel /> },
      { path: 'audit', element: <AuditLedgerPage /> },
      { path: 'telemetry', element: <TelemetryAnalyticsPage /> },
      { path: 'telemetry/model-ranking', element: <ModelRankingPage /> },
      { path: 'telemetry/training-pairs', element: <TrainingPairsBrowser /> },
      { path: 'telemetry/snapshot-corpus', element: <SnapshotCorpusPage /> },
      { path: 'context-pulls', element: <ContextPullInspector /> },
      {
        path: 'telemetry/trajectories/:queryId',
        element: <QueryTrajectoryViewPage />,
      },
      { path: 'admin', loader: () => redirect('/admin/dispatch-policy') },
      { path: 'admin/dispatch-policy', element: <AdminDispatchPolicyPage /> },
      // action-docs-corpus-frontend AF2: one component owns all three
      // routes; useParams drives surface tab + detail-view selection.
      // URL format pinned in docs/ACTION_DOCS_FRONTEND.md §4.
      { path: 'docs/actions', element: <ActionDocsPage /> },
      { path: 'docs/actions/:surface', element: <ActionDocsPage /> },
      { path: 'docs/actions/:surface/:action', element: <ActionDocsPage /> },
      { path: '*', loader: () => redirect('/tasks/chains') },
    ],
  },
]
