import { render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { SnapshotCorpusPage } from './index'
import * as api from '../../api/arcCorpus'
import type { ArcCorpusStatsResponse } from '../../api/types.gen'

vi.mock('../../api/arcCorpus', () => ({ getSnapshotCorpusStats: vi.fn() }))
const mockStats = vi.mocked(api.getSnapshotCorpusStats)

beforeEach(() => mockStats.mockReset())

const STATS: ArcCorpusStatsResponse = {
  total_rows: 281,
  distinct_sessions: 34,
  by_source: { live: 16, recovered: 265 },
  truncated_rows: 281,
  tuple_complete_rows: 259,
  message_count_buckets: [
    { label: '1-5', count: 11 },
    { label: '6-10', count: 2 },
    { label: '11-15', count: 28 },
    { label: '16-19', count: 29 },
    { label: '20', count: 211 },
  ],
  estimated_tokens_buckets: [
    { label: '<1000', count: 0 },
    { label: '1000-1999', count: 22 },
    { label: '2000-2999', count: 93 },
    { label: '3000-3999', count: 159 },
    { label: '4000+', count: 7 },
  ],
}

function renderPage() {
  return render(
    <MemoryRouter>
      <SnapshotCorpusPage />
    </MemoryRouter>,
  )
}

describe('SnapshotCorpusPage', () => {
  test('renders the heading and a loading state before data resolves', async () => {
    let resolve!: (v: ArcCorpusStatsResponse) => void
    mockStats.mockReturnValue(
      new Promise<ArcCorpusStatsResponse>((r) => {
        resolve = r
      }),
    )
    renderPage()
    expect(screen.getByRole('heading', { name: /Arc-Close Snapshot Corpus/ })).toBeInTheDocument()
    expect(screen.getByTestId('snapshot-corpus-loading')).toBeInTheDocument()
    // Resolve before the test ends so React settles and cleanup doesn't hang.
    resolve(STATS)
    await waitFor(() =>
      expect(screen.queryByTestId('snapshot-corpus-loading')).not.toBeInTheDocument(),
    )
  })

  test('renders scalar cards + the live/recovered source split from real-shaped data', async () => {
    mockStats.mockResolvedValueOnce(STATS)
    renderPage()

    await waitFor(() => expect(screen.getByTestId('snapshot-corpus-cards')).toBeInTheDocument())

    expect(within(screen.getByTestId('stat-total')).getByText('281')).toBeInTheDocument()
    expect(within(screen.getByTestId('stat-sessions')).getByText('34')).toBeInTheDocument()
    expect(within(screen.getByTestId('stat-complete')).getByText('259')).toBeInTheDocument()

    const live = screen.getByTestId('source-live')
    const recovered = screen.getByTestId('source-recovered')
    expect(within(live).getByText('16')).toBeInTheDocument()
    expect(within(recovered).getByText('265')).toBeInTheDocument()
  })

  test('surfaces the holdout-by-session + truncated caveat', async () => {
    mockStats.mockResolvedValueOnce(STATS)
    renderPage()
    const caveat = await screen.findByTestId('snapshot-corpus-caveat')
    expect(caveat).toHaveTextContent(/Holdout by session/i)
    expect(caveat).toHaveTextContent(/truncated/i)
  })

  test('renders both distribution charts', async () => {
    mockStats.mockResolvedValueOnce(STATS)
    renderPage()
    expect(await screen.findByTestId('chart-message-count')).toBeInTheDocument()
    expect(screen.getByTestId('chart-estimated-tokens')).toBeInTheDocument()
  })

  test('shows an error state when the fetch rejects', async () => {
    mockStats.mockRejectedValueOnce(new Error('boom'))
    renderPage()
    const err = await screen.findByTestId('snapshot-corpus-error')
    expect(err).toHaveTextContent(/boom/)
  })
})
