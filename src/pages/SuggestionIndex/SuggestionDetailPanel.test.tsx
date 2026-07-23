import { render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { SuggestionDetailPanel } from './SuggestionDetailPanel'
import type { SuggestionDetail } from '../../lib/suggestionIndex'

// EventTimeline issues an auto-fetch on mount. Short-circuit to a
// forever-pending promise so the timeline stays in its loading state
// and the detail-panel layout tests stay focused.
vi.mock('../../api/auditEvents', () => ({
  listEntityAuditEvents: vi.fn(() => new Promise(() => {})),
}))

const openSuggestion = (): SuggestionDetail => ({
  slug: 'open-sug-slug',
  title: 'Open Suggestion Title',
  problem_statement: 'The case for the proposed change.',
  surface: 'arcreview,dispatch',
  priority: 'medium',
  source: 'session retro on 2026-05-20',
  acceptance_criteria: 'Per-action threshold map exists.',
  constraints: 'Do NOT change current behavior.',
  status: 'open',
  resolution_kind: null,
  routed_chain_slug: '',
  routed_task_slug: '',
  routed_bug_slug: '',
  resolved_commit_sha: null,
  filed_at: '2026-05-21T00:00:00Z',
  resolved_at: null,
  project_id: 'mcp-servers',
})

const adoptedSuggestion = (): SuggestionDetail => ({
  ...openSuggestion(),
  slug: 'adopted-sug-slug',
  title: 'Adopted Suggestion',
  status: 'adopted',
  resolution_kind: 'adopted',
  resolved_at: '2026-05-22T15:00:00Z',
  resolved_commit_sha: 'b39a6d0',
  routed_chain_slug: 'agent-suggestion-box',
  routed_task_slug: 'integrate-suggestion-into-arcreview-pipeline',
  routed_bug_slug: 'sug-followup',
})

const deferredSuggestion = (): SuggestionDetail => ({
  ...openSuggestion(),
  slug: 'deferred-sug-slug',
  title: 'Deferred Suggestion',
  status: 'deferred',
  resolution_kind: 'deferred',
  resolved_at: '2026-05-21T01:35:14Z',
})

describe('SuggestionDetailPanel', () => {
  test('shows loading state when loading=true', () => {
    render(<SuggestionDetailPanel detail={null} loading error={null} />)
    expect(screen.getByTestId('suggestion-detail-loading')).toBeInTheDocument()
  })

  test('shows error message when error is provided', () => {
    render(<SuggestionDetailPanel detail={null} loading={false} error="fetch failed" />)
    expect(screen.getByTestId('suggestion-detail-error').textContent).toContain(
      'fetch failed',
    )
  })

  test('open suggestion: renders slug, priority, surface, problem_statement', () => {
    render(
      <SuggestionDetailPanel detail={openSuggestion()} loading={false} error={null} />,
    )
    expect(screen.getByTestId('suggestion-detail-slug').textContent).toBe('open-sug-slug')
    expect(screen.getByText('Open Suggestion Title')).toBeInTheDocument()
    expect(screen.getByTestId('suggestion-detail-priority').textContent).toBe('medium')
    expect(screen.getByTestId('suggestion-detail-surface')).toBeInTheDocument()
    expect(
      screen.getByTestId('suggestion-detail-problem-statement').textContent,
    ).toContain('case for the proposed change')
  })

  // resolution_note prose-block retired in migration 065 (Phase 4 F3);
  // the value now surfaces via the EventTimeline's SuggestionResolved
  // row instead. The routed pointers section remains.
  test('open suggestion: no routed pointers rendered', () => {
    render(
      <SuggestionDetailPanel detail={openSuggestion()} loading={false} error={null} />,
    )
    expect(screen.queryByTestId('suggestion-detail-routed-pointers')).toBeNull()
  })

  test('open suggestion: renders acceptance_criteria when non-empty', () => {
    render(
      <SuggestionDetailPanel detail={openSuggestion()} loading={false} error={null} />,
    )
    expect(
      screen.getByTestId('suggestion-detail-acceptance-criteria').textContent,
    ).toContain('Per-action threshold map')
  })

  test('adopted suggestion: renders resolved_at', () => {
    render(
      <SuggestionDetailPanel detail={adoptedSuggestion()} loading={false} error={null} />,
    )
    expect(screen.getByText('Resolved')).toBeInTheDocument()
  })

  test('adopted suggestion: renders all three routed pointers (chain + task + bug)', () => {
    render(
      <SuggestionDetailPanel detail={adoptedSuggestion()} loading={false} error={null} />,
    )
    const pointers = screen.getByTestId('suggestion-detail-routed-pointers')
    expect(pointers).toBeInTheDocument()
    expect(pointers.textContent).toContain('agent-suggestion-box')
    expect(pointers.textContent).toContain('integrate-suggestion-into-arcreview-pipeline')
    expect(pointers.textContent).toContain('sug-followup')
  })

  test('deferred suggestion: no routed pointers when all three are empty', () => {
    render(
      <SuggestionDetailPanel
        detail={deferredSuggestion()}
        loading={false}
        error={null}
      />,
    )
    expect(screen.queryByTestId('suggestion-detail-routed-pointers')).toBeNull()
  })
})
