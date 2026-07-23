import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { AssaysPage } from './index'
import { getAssayDetail, listAssays } from '../../api/assays'
import type { AssayRunDetail, AssayRunRow } from '../../lib/assays'

vi.mock('../../api/assays', () => ({
  listAssays: vi.fn(),
  getAssayDetail: vi.fn(),
}))
// SSE is exercised separately; stub the tick hook so the deterministic
// render tests don't open an EventSource.
vi.mock('../../hooks/useEventBus', () => ({
  useEventTick: () => 0,
  useEventBus: vi.fn(),
}))
// ProjectPicker probes /projects on mount; stub the admin API so the
// test doesn't depend on a live fetch.
vi.mock('../../api/admin', () => ({
  listProjects: vi.fn().mockResolvedValue([]),
}))

const mockList = vi.mocked(listAssays)
const mockDetail = vi.mocked(getAssayDetail)

const ROWS: AssayRunRow[] = [
  {
    run_id: 'sr-1',
    name: 'casg-direct-v3-smoke',
    assay: 'grounded-glyph-probe',
    item_id: 'casg-direct',
    image_ref: 'localhost/lab-grounded-glyph-probe:dev',
    image_digest: 'sha256:4fe91f54ce7f',
    model_id: 'Qwen2.5-32B-Instruct-Q4_K_M.gguf',
    model_version: 'q4km',
    status: 'completed',
    error: '',
    run_at: '2026-07-09T00:33:10Z',
  },
  {
    run_id: 'sr-2',
    name: 'casg-direct-failed',
    assay: 'grounded-glyph-probe',
    item_id: 'casg-direct',
    image_ref: 'localhost/lab-grounded-glyph-probe:dev',
    image_digest: 'sha256:deadbeef',
    model_id: 'Qwen2.5-32B-Instruct-Q4_K_M.gguf',
    model_version: 'q4km',
    status: 'failed',
    error: 'container exited 1',
    run_at: '2026-07-09T01:00:00Z',
  },
]

const DETAIL: AssayRunDetail = {
  ...ROWS[0],
  study_digest: 'abc123',
  materials_hashes: { 'scenario.md': 'h1', 'glyph.md': 'h2' },
  responses_dir: '/abs/out/responses',
  scores: [
    { condition: 'baseline', run: 1, verdict_kind: 'fail', verdict_reason: 'no glyph', item: 'casg-direct', rationale: 'r' },
    { condition: 'grounded_glyph', run: 1, verdict_kind: 'pass', verdict_reason: '', item: 'casg-direct', rationale: 'r' },
  ],
}

beforeEach(() => {
  mockList.mockReset()
  mockDetail.mockReset()
})

function renderPage() {
  return render(
    <MemoryRouter>
      <AssaysPage />
    </MemoryRouter>,
  )
}

describe('AssaysPage', () => {
  test('renders a row per study run', async () => {
    mockList.mockResolvedValue(ROWS)
    renderPage()
    await waitFor(() => expect(screen.getAllByTestId('assay-row')).toHaveLength(2))
    expect(screen.getByText('casg-direct-v3-smoke')).toBeInTheDocument()
  })

  test('clicking a row opens the detail panel with provenance + score grid', async () => {
    mockList.mockResolvedValue(ROWS)
    mockDetail.mockResolvedValue(DETAIL)
    renderPage()
    await waitFor(() => expect(screen.getAllByTestId('assay-row').length).toBeGreaterThan(0))

    fireEvent.click(screen.getAllByTestId('assay-row')[0])

    await waitFor(() => expect(screen.getByTestId('assay-detail-run-id')).toHaveTextContent('sr-1'))
    // Provenance fields.
    expect(screen.getByTestId('assay-detail-image-digest')).toHaveTextContent('sha256:4fe91f54ce7f')
    expect(screen.getByTestId('assay-detail-model')).toHaveTextContent('Qwen2.5-32B-Instruct-Q4_K_M.gguf')
    expect(screen.getByTestId('assay-detail-status')).toHaveTextContent('completed')

    // Score grid cells, colored by verdict.
    const grid = screen.getByTestId('assay-score-grid')
    expect(grid).toBeInTheDocument()
    const failCell = screen.getByTestId('assay-score-cell-baseline-1')
    expect(within(failCell).getByText('FAIL')).toBeInTheDocument()
    const passCell = screen.getByTestId('assay-score-cell-grounded_glyph-1')
    expect(within(passCell).getByText('PASS')).toBeInTheDocument()
  })

  test('a failed run with no scores shows the error and no grid', async () => {
    mockList.mockResolvedValue(ROWS)
    mockDetail.mockResolvedValue({ ...ROWS[1], study_digest: '', materials_hashes: {}, responses_dir: '', scores: [] })
    renderPage()
    await waitFor(() => expect(screen.getAllByTestId('assay-row').length).toBe(2))

    fireEvent.click(screen.getAllByTestId('assay-row')[1])

    await waitFor(() => expect(screen.getByTestId('assay-run-error')).toHaveTextContent('container exited 1'))
    expect(screen.queryByTestId('assay-score-grid')).toBeNull()
  })

  test('shows an empty state when no runs match', async () => {
    mockList.mockResolvedValue([])
    renderPage()
    await waitFor(() =>
      expect(screen.getByText('No study runs match the current filters.')).toBeInTheDocument(),
    )
  })
})
