import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, test, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { SuggestionIndexPage } from './index'
import * as api from '../../api/suggestions'

// T4b coverage baseline: page-level render of SuggestionIndex.
// Pairs with SuggestionDetailPanel.test.tsx (detail-pane shape) to give
// the dashboard's suggestion surface a full Vitest baseline before
// T5/T6's CRUD-drop. T6a re-runs against rebuilt-from-events state.

vi.mock('../../api/suggestions', async () => {
  const real = await vi.importActual<typeof api>('../../api/suggestions')
  return {
    ...real,
    listSuggestions: vi.fn(),
    readSuggestion: vi.fn(),
    getSuggestionResolutionMix: vi.fn(),
  }
})
// EventTimeline auto-fetches on mount. Short-circuit so the test stays focused.
vi.mock('../../api/auditEvents', () => ({
  listEntityAuditEvents: vi.fn(() => new Promise(() => {})),
}))

const mockList = vi.mocked(api.listSuggestions)
const mockRead = vi.mocked(api.readSuggestion)
const mockMix = vi.mocked(api.getSuggestionResolutionMix)

beforeEach(() => {
  mockList.mockReset()
  mockRead.mockReset()
  mockMix.mockReset()
})

function renderPage() {
  return render(
    <MemoryRouter>
      <SuggestionIndexPage />
    </MemoryRouter>,
  )
}

describe('SuggestionIndexPage', () => {
  test('shows empty state when listSuggestions returns no rows', async () => {
    mockList.mockResolvedValueOnce({ suggestions: [], count: 0 })
    mockMix.mockResolvedValueOnce({
      open: 0,
      adopted: 0,
      deferred: 0,
      rejected: 0,
    })
    renderPage()
    await waitFor(() => {
      expect(screen.queryAllByTestId('suggestion-row')).toHaveLength(0)
    })
  })

  test('renders one row per suggestion returned by listSuggestions', async () => {
    mockList.mockResolvedValueOnce({
      suggestions: [
        {
          project_id: 'mcp-servers',
          slug: 'sug-a',
          title: 'Suggestion A',
          surface: 'arcreview',
          priority: 'high',
          status: 'open',
          filed_at: '2026-05-21T00:00:00Z',
          resolved_at: null,
          routed_chain_slug: '',
          routed_task_slug: '',
          routed_bug_slug: '',
          resolved_commit_sha: null,
        },
        {
          project_id: 'mcp-servers',
          slug: 'sug-b',
          title: 'Suggestion B',
          surface: 'precommit',
          priority: 'medium',
          status: 'open',
          filed_at: '2026-05-20T00:00:00Z',
          resolved_at: null,
          routed_chain_slug: '',
          routed_task_slug: '',
          routed_bug_slug: '',
          resolved_commit_sha: null,
        },
      ],
      count: 2,
    })
    mockMix.mockResolvedValueOnce({ open: 2, adopted: 0, deferred: 0, rejected: 0 })
    renderPage()
    await waitFor(() => {
      expect(screen.getAllByTestId('suggestion-row')).toHaveLength(2)
    })
  })

  test('exposes the status / priority / search filter controls', async () => {
    mockList.mockResolvedValueOnce({ suggestions: [], count: 0 })
    mockMix.mockResolvedValueOnce({ open: 0, adopted: 0, deferred: 0, rejected: 0 })
    renderPage()
    await waitFor(() => {
      expect(screen.getByTestId('suggestion-status-filter')).toBeInTheDocument()
    })
    expect(screen.getByTestId('suggestion-priority-filter')).toBeInTheDocument()
    expect(screen.getByTestId('suggestion-search-filter')).toBeInTheDocument()
  })

  test('the detail panel mounts (empty initial state — no selection)', async () => {
    mockList.mockResolvedValueOnce({ suggestions: [], count: 0 })
    mockMix.mockResolvedValueOnce({ open: 0, adopted: 0, deferred: 0, rejected: 0 })
    renderPage()
    await waitFor(() => {
      expect(screen.getByTestId('suggestion-detail-panel')).toBeInTheDocument()
    })
  })
})
