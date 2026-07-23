import { render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { MemorySubstratePage } from './index'
import * as api from '../../api/memorySubstrate'
import type { MemorySubstrateStats } from '../../api/types.gen'

vi.mock('../../api/memorySubstrate', () => ({ getMemorySubstrateStats: vi.fn() }))
const mockStats = vi.mocked(api.getMemorySubstrateStats)

beforeEach(() => mockStats.mockReset())

const STATS: MemorySubstrateStats = {
  total_memories: 82,
  by_kind: [
    { key: 'feedback', count: 49 },
    { key: 'project', count: 18 },
    { key: 'reference', count: 12 },
    { key: 'user', count: 3 },
  ],
  memory_written_total: 98,
  by_source: [
    { key: 'migration', count: 92 },
    { key: 'manual', count: 4 },
    { key: 'user-correction-2026-05-22', count: 1 },
    { key: '(unset)', count: 1 },
  ],
  event_rate: [
    { day: '2026-05-22', count: 93 },
    { day: '2026-05-24', count: 5 },
  ],
  parse_context_hits: 50,
  oldest_filed_at: '2026-05-22T18:34:54.571Z',
  newest_filed_at: '2026-05-24T23:38:25.840Z',
}

function renderPage() {
  return render(
    <MemoryRouter>
      <MemorySubstratePage />
    </MemoryRouter>,
  )
}

describe('MemorySubstratePage', () => {
  test('renders the heading and a loading state before data resolves', async () => {
    let resolve!: (v: MemorySubstrateStats) => void
    mockStats.mockReturnValue(
      new Promise<MemorySubstrateStats>((r) => {
        resolve = r
      }),
    )
    renderPage()
    expect(screen.getByRole('heading', { name: /Memory Substrate/ })).toBeInTheDocument()
    expect(screen.getByTestId('memory-substrate-loading')).toBeInTheDocument()
    resolve(STATS)
    await waitFor(() =>
      expect(screen.queryByTestId('memory-substrate-loading')).not.toBeInTheDocument(),
    )
  })

  test('renders scalar cards from real-shaped data', async () => {
    mockStats.mockResolvedValueOnce(STATS)
    renderPage()

    await waitFor(() => expect(screen.getByTestId('memory-substrate-cards')).toBeInTheDocument())

    expect(within(screen.getByTestId('stat-total-memories')).getByText('82')).toBeInTheDocument()
    expect(within(screen.getByTestId('stat-events')).getByText('98')).toBeInTheDocument()
    expect(within(screen.getByTestId('stat-parse-context-hits')).getByText('50')).toBeInTheDocument()
  })

  test('renders the by-kind, by-source, and event-rate charts', async () => {
    mockStats.mockResolvedValueOnce(STATS)
    renderPage()
    expect(await screen.findByTestId('chart-by-kind')).toBeInTheDocument()
    expect(screen.getByTestId('chart-by-source')).toBeInTheDocument()
    expect(screen.getByTestId('chart-event-rate')).toBeInTheDocument()
  })

  test('surfaces the first-pass / legacy-writer caveat', async () => {
    mockStats.mockResolvedValueOnce(STATS)
    renderPage()
    const caveat = await screen.findByTestId('memory-substrate-caveat')
    expect(caveat).toHaveTextContent(/First-pass/i)
    expect(caveat).toHaveTextContent(/own-memory-read-then-disable-harness-auto-memory/)
  })

  test('shows an error state when the fetch rejects', async () => {
    mockStats.mockRejectedValueOnce(new Error('boom'))
    renderPage()
    const err = await screen.findByTestId('memory-substrate-error')
    expect(err).toHaveTextContent(/boom/)
  })
})
