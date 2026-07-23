import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, test, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { ChainIndexPage } from './index'
import * as chainsApi from '../../api/chains'
import * as tasksApi from '../../api/tasks'

// T4b coverage baseline: page-level render of ChainIndex.
// ChainIndex was previously e2e-only (apps/dashboard/tests/e2e/chain-index.spec.ts);
// adding Vitest coverage for the load-bearing list + selection paths so
// T6a has a snapshot-diff target for the rebuilt-from-events run.

vi.mock('../../api/chains', async () => {
  const real = await vi.importActual<typeof chainsApi>('../../api/chains')
  return {
    ...real,
    listChains: vi.fn(),
    getChainState: vi.fn(),
    findChain: vi.fn(),
  }
})
vi.mock('../../api/tasks', async () => {
  const real = await vi.importActual<typeof tasksApi>('../../api/tasks')
  return {
    ...real,
    searchTasks: vi.fn(),
  }
})

const mockListChains = vi.mocked(chainsApi.listChains)
const mockGetChainState = vi.mocked(chainsApi.getChainState)
const mockFindChain = vi.mocked(chainsApi.findChain)
const mockSearchTasks = vi.mocked(tasksApi.searchTasks)

beforeEach(() => {
  mockListChains.mockReset()
  mockGetChainState.mockReset()
  mockFindChain.mockReset()
  mockSearchTasks.mockReset()
  mockSearchTasks.mockResolvedValue({ count: 0, truncated: false, pattern: '', matches: [] })
})

function renderPage() {
  return render(
    <MemoryRouter>
      <ChainIndexPage />
    </MemoryRouter>,
  )
}

describe('ChainIndexPage', () => {
  test('renders chain rows from listChains', async () => {
    mockListChains.mockResolvedValueOnce({
      chains: [
        {
          slug: 'chain-a',
          status: 'open',
          tasks_total: 5,
          tasks_pending: 2,
          tasks_active: 1,
          tasks_blocked: 1,
          tasks_closed: 1,
          tasks_cancelled: 0,
          updated_at: '2026-05-21T00:00:00Z',
        },
        {
          slug: 'chain-b',
          status: 'open',
          tasks_total: 3,
          tasks_pending: 0,
          tasks_active: 1,
          tasks_blocked: 0,
          tasks_closed: 2,
          tasks_cancelled: 0,
          updated_at: '2026-05-20T00:00:00Z',
        },
      ],
    })
    renderPage()
    await waitFor(() => {
      expect(screen.getAllByTestId('chain-item').length).toBeGreaterThanOrEqual(2)
    })
  })

  test('shows empty state when listChains returns no rows', async () => {
    mockListChains.mockResolvedValueOnce({ chains: [] })
    renderPage()
    await waitFor(() => {
      expect(screen.queryAllByTestId('chain-item')).toHaveLength(0)
    })
  })

  test('exposes the chain-search and task-content-search controls', async () => {
    mockListChains.mockResolvedValueOnce({ chains: [] })
    renderPage()
    await waitFor(() => {
      expect(screen.getByTestId('chain-search')).toBeInTheDocument()
    })
    expect(screen.getByTestId('task-content-search')).toBeInTheDocument()
  })
})
