import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDispatchPolicy } from '../../api/dispatchPolicy'
import { AdminDispatchPolicyPage } from '.'

vi.mock('../../api/dispatchPolicy', () => ({
  getDispatchPolicy: vi.fn(),
}))

const mockGet = vi.mocked(getDispatchPolicy)

// The page now renders cross-links into the action-docs surface via
// react-router <Link>. Wrap every render() so the Router context is
// available; the inbound docs link tests below assert against MemoryRouter
// navigation.
function renderPage() {
  return render(
    <MemoryRouter>
      <AdminDispatchPolicyPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockGet.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('AdminDispatchPolicyPage — loading / error / empty', () => {
  it('renders the loading placeholder while fetching', async () => {
    let resolve!: (v: Awaited<ReturnType<typeof getDispatchPolicy>>) => void
    mockGet.mockReturnValueOnce(new Promise((r) => { resolve = r }))
    renderPage()
    expect(screen.getByTestId('admin-dispatch-policy-loading')).toBeInTheDocument()
    await act(async () => {
      resolve({ path: '/p', loaded: true, surfaces: {} })
    })
  })

  it('renders an error message and role=alert when the fetch fails', async () => {
    mockGet.mockRejectedValueOnce(new Error('boom'))
    renderPage()
    await waitFor(() =>
      expect(screen.getByTestId('admin-dispatch-policy-error')).toHaveTextContent('boom'),
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('shows the "not loaded" indicator when the server reports loaded=false', async () => {
    mockGet.mockResolvedValueOnce({
      path: '/p/dispatch-policy.toml',
      loaded: false,
      surfaces: {},
    })
    renderPage()
    await waitFor(() =>
      expect(screen.getByTestId('admin-dispatch-policy-not-loaded')).toBeInTheDocument(),
    )
  })

  it('renders the no-entries empty state when surfaces map is empty', async () => {
    mockGet.mockResolvedValueOnce({ path: '/p', loaded: true, surfaces: {} })
    renderPage()
    await waitFor(() =>
      expect(screen.getByTestId('admin-dispatch-policy-empty')).toBeInTheDocument(),
    )
  })
})

describe('AdminDispatchPolicyPage — surface tabs', () => {
  it('renders a tab per surface and the rows of the active surface', async () => {
    mockGet.mockResolvedValueOnce({
      path: '/p',
      loaded: true,
      surfaces: {
        work: {
          bug_resolve: { requires_rationale: true },
          bug_read: { requires_rationale: false },
        },
        knowledge: {
          kiwix_search: { requires_rationale: false },
        },
      },
    })
    renderPage()
    await waitFor(() =>
      expect(screen.getByTestId('admin-dispatch-policy-tab-work')).toBeInTheDocument(),
    )
    expect(screen.getByTestId('admin-dispatch-policy-tab-knowledge')).toBeInTheDocument()

    // Default active tab is the alphabetically-first surface (knowledge < work).
    expect(screen.getByTestId('admin-dispatch-policy-table-knowledge')).toBeInTheDocument()
    expect(screen.queryByTestId('admin-dispatch-policy-table-work')).toBeNull()
  })

  it('switches the active surface on tab click', async () => {
    mockGet.mockResolvedValueOnce({
      path: '/p',
      loaded: true,
      surfaces: {
        work: { bug_resolve: { requires_rationale: true } },
        admin: { schema_reload: { requires_rationale: true } },
      },
    })
    renderPage()
    const workTab = await screen.findByTestId('admin-dispatch-policy-tab-work')
    await act(async () => {
      fireEvent.click(workTab)
    })
    await waitFor(() =>
      expect(screen.getByTestId('admin-dispatch-policy-table-work')).toBeInTheDocument(),
    )
    expect(screen.queryByTestId('admin-dispatch-policy-table-admin')).toBeNull()
  })

  it('renders the required / not-required chip per action', async () => {
    mockGet.mockResolvedValueOnce({
      path: '/p',
      loaded: true,
      surfaces: {
        work: {
          bug_resolve: { requires_rationale: true },
          bug_read: { requires_rationale: false },
        },
      },
    })
    renderPage()
    await waitFor(() =>
      expect(screen.getByTestId('admin-dispatch-policy-table-work')).toBeInTheDocument(),
    )

    const resolveRow = screen.getByTestId('admin-dispatch-policy-row-work-bug_resolve')
    expect(resolveRow).toHaveTextContent(/required/i)

    const readRow = screen.getByTestId('admin-dispatch-policy-row-work-bug_read')
    expect(readRow).toHaveTextContent(/not required/i)
  })

  it('emits data-action-key on each row for action-docs-corpus cross-link', async () => {
    mockGet.mockResolvedValueOnce({
      path: '/p',
      loaded: true,
      surfaces: { work: { bug_resolve: { requires_rationale: true } } },
    })
    renderPage()
    const row = await screen.findByTestId('admin-dispatch-policy-row-work-bug_resolve')
    expect(row.getAttribute('data-action-key')).toBe('work.bug_resolve')
  })

  // action-docs-corpus-frontend AF2: each policy row now carries a "docs"
  // link to /docs/actions/<surface>/<action> and an id="<surface>.<action>"
  // anchor target for the outbound cross-link FROM the action-docs detail
  // view's "see dispatch policy entry" chip. URL format pinned in
  // docs/ACTION_DOCS_FRONTEND.md §7.
  it('renders an inbound docs link per row, targeting /docs/actions/<surface>/<action>', async () => {
    mockGet.mockResolvedValueOnce({
      path: '/p',
      loaded: true,
      surfaces: { work: { bug_resolve: { requires_rationale: true } } },
    })
    renderPage()
    const link = await screen.findByTestId(
      'admin-dispatch-policy-docs-link-work-bug_resolve',
    )
    expect(link).toHaveAttribute('href', '/docs/actions/work/bug_resolve')
  })

  it('emits id=<surface>.<action> on each row as the anchor target for outbound cross-link', async () => {
    mockGet.mockResolvedValueOnce({
      path: '/p',
      loaded: true,
      surfaces: { work: { bug_resolve: { requires_rationale: true } } },
    })
    renderPage()
    const row = await screen.findByTestId('admin-dispatch-policy-row-work-bug_resolve')
    expect(row.getAttribute('id')).toBe('work.bug_resolve')
  })
})

describe('AdminDispatchPolicyPage — reload', () => {
  it('refetches when the reload button is clicked', async () => {
    mockGet.mockResolvedValue({
      path: '/p',
      loaded: true,
      surfaces: { work: { bug_resolve: { requires_rationale: true } } },
    })
    renderPage()
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1))

    const reloadBtn = screen.getByTestId('admin-dispatch-policy-reload')
    await act(async () => {
      fireEvent.click(reloadBtn)
    })
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2))
  })

  it('preserves the active tab across reloads', async () => {
    mockGet.mockResolvedValue({
      path: '/p',
      loaded: true,
      surfaces: {
        admin: { schema_reload: { requires_rationale: true } },
        work: { bug_resolve: { requires_rationale: true } },
      },
    })
    renderPage()
    const workTab = await screen.findByTestId('admin-dispatch-policy-tab-work')
    await act(async () => {
      fireEvent.click(workTab)
    })
    await waitFor(() =>
      expect(screen.getByTestId('admin-dispatch-policy-table-work')).toBeInTheDocument(),
    )

    const reloadBtn = screen.getByTestId('admin-dispatch-policy-reload')
    await act(async () => {
      fireEvent.click(reloadBtn)
    })
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2))
    // Tab still on work, not reset to admin.
    expect(screen.getByTestId('admin-dispatch-policy-table-work')).toBeInTheDocument()
  })
})

describe('AdminDispatchPolicyPage — accessibility', () => {
  it('marks the tablist with role=tablist and tabs with role=tab', async () => {
    mockGet.mockResolvedValueOnce({
      path: '/p',
      loaded: true,
      surfaces: { work: { bug_resolve: { requires_rationale: true } } },
    })
    renderPage()
    await waitFor(() =>
      expect(screen.getByRole('tablist')).toBeInTheDocument(),
    )
    expect(screen.getAllByRole('tab').length).toBeGreaterThan(0)
  })
})
