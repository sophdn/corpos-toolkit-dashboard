import { render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { BugDetailPanel } from './BugDetailPanel'
import type { BugDetail } from '../../lib/bugIndex'

// EventTimeline issues an auto-fetch on mount. These tests cover the
// detail-panel layout, not the timeline behavior, so we short-circuit
// the API call to a forever-pending promise — the timeline stays in its
// loading state and doesn't trigger an act() warning.
vi.mock('../../api/auditEvents', () => ({
  listEntityAuditEvents: vi.fn(() => new Promise(() => {})),
}))

const openBug = (): BugDetail => ({
  slug: 'open-bug-slug',
  title: 'Open Bug Title',
  problem_statement: 'The problem statement for the open bug.',
  surface: 'seed-mcp,library',
  severity: 'medium',
  source: 'session-journal',
  acceptance_criteria: 'All edge cases handled.',
  constraints: 'Must not break existing tests.',
  status: 'open',
  routed_chain_slug: '',
  routed_task_slug: '',
  filed_at: '2026-04-20T10:00:00Z',
  resolved_at: null,
  resolved_commit_sha: null,
  resolved_dirty: null,
  spawned_successor_slug: null,
  recurrence_candidates: null,
  resolution_kind: null,
  project_id: 'seed-packet',
})

const resolvedBug = (): BugDetail => ({
  ...openBug(),
  slug: 'resolved-bug-slug',
  title: 'Resolved Bug',
  status: 'fixed',
  resolved_at: '2026-04-21T15:00:00Z',
  resolved_commit_sha: 'abc123',
})

const routedBug = (): BugDetail => ({
  ...openBug(),
  slug: 'routed-bug-slug',
  title: 'Routed Bug',
  status: 'routed',
  routed_chain_slug: 'fix-routed-chain',
  routed_task_slug: 'fix-routed-task',
})

describe('BugDetailPanel', () => {
  // @blurb Shows a loading indicator while the bug_read request is in-flight so
  // @blurb the user sees immediate feedback after clicking a row.
  test('shows loading state when loading=true', () => {
    render(<BugDetailPanel detail={null} loading error={null} />)
    expect(screen.getByTestId('bug-detail-loading')).toBeInTheDocument()
  })

  // @blurb Shows an error message when the bug_read fetch fails, so the user
  // @blurb knows the detail could not be loaded rather than seeing a blank panel.
  test('shows error message when error is provided', () => {
    render(<BugDetailPanel detail={null} loading={false} error="fetch failed" />)
    expect(screen.getByTestId('bug-detail-error').textContent).toContain('fetch failed')
  })

  // @blurb Open bug renders slug, title, status, severity, surface, and
  // @blurb problem_statement — the core fields always present for open bugs.
  test('open bug: renders slug, status, severity, surface, problem_statement', () => {
    render(<BugDetailPanel detail={openBug()} loading={false} error={null} />)
    expect(screen.getByTestId('bug-detail-slug').textContent).toBe('open-bug-slug')
    expect(screen.getByText('Open Bug Title')).toBeInTheDocument()
    expect(screen.getByTestId('bug-detail-severity').textContent).toBe('medium')
    expect(screen.getByTestId('bug-detail-surface')).toBeInTheDocument()
    expect(screen.getByTestId('bug-detail-problem-statement').textContent).toContain(
      'The problem statement',
    )
  })

  // @blurb Open bug does not render routed pointers section — empty strings
  // @blurb must not produce spurious sections in the panel. The
  // @blurb resolution_note prose-block also doesn't render (retired in
  // @blurb migration 065 / Phase 4 F3); the value surfaces via the
  // @blurb EventTimeline's BugResolved event row instead.
  test('open bug: no routed pointers rendered', () => {
    render(<BugDetailPanel detail={openBug()} loading={false} error={null} />)
    expect(screen.queryByTestId('bug-detail-routed-pointers')).toBeNull()
  })

  // @blurb Acceptance criteria section renders when the field is non-empty,
  // @blurb giving the reviewer the full AC without navigating to a separate view.
  test('open bug: renders acceptance_criteria when non-empty', () => {
    render(<BugDetailPanel detail={openBug()} loading={false} error={null} />)
    expect(screen.getByTestId('bug-detail-acceptance-criteria').textContent).toContain(
      'All edge cases handled',
    )
  })

  // @blurb Resolved bug shows the resolved_at timestamp in the meta strip so
  // @blurb the reviewer knows when the fix landed.
  test('resolved bug: shows resolved_at in meta strip', () => {
    render(<BugDetailPanel detail={resolvedBug()} loading={false} error={null} />)
    expect(screen.getByText('Resolved')).toBeInTheDocument()
    expect(screen.getByText('2026-04-21')).toBeInTheDocument()
  })

  // @blurb Routed bug renders the routed_chain_slug and routed_task_slug so the
  // @blurb reviewer can navigate to the chain that owns the fix.
  test('routed bug: renders routed chain and task pointers', () => {
    render(<BugDetailPanel detail={routedBug()} loading={false} error={null} />)
    const pointers = screen.getByTestId('bug-detail-routed-pointers')
    expect(pointers).toBeInTheDocument()
    expect(pointers.textContent).toContain('fix-routed-chain')
    expect(pointers.textContent).toContain('fix-routed-task')
  })

})
