import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { getScenarios } from '../../api/scenarios'
import type { ScenarioEntry } from '../../lib/scenarios'
import { ScenariosPage } from '.'

vi.mock('../../api/scenarios', () => ({ getScenarios: vi.fn() }))
const mockGetScenarios = vi.mocked(getScenarios)

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const FIXTURE: ScenarioEntry[] = [
  {
    layer: 'l4', id: 'l4-bl-status-open', tool_name: 'bug_list',
    user_prompt: 'Show me all currently open bugs.',
    expected_args: [{ name: 'status', kind: 'exact', value: 'open' }],
  },
  {
    layer: 'l5', id: 'l5-bl-open-count', tool_name: 'bug_list',
    tool_output: '[{"slug":"foo","status":"open"}]',
    question: 'How many bugs are listed?',
    expected_answer: '1',
  },
  {
    layer: 'l6', id: 'l6-bl-route', tool_name: 'bug_list',
    user_prompt: 'I want aggregate counts.',
    expected_decision: { kind: 'route_to', route_to: 'bug_resolution_mix' },
  },
  {
    layer: 'l4', id: 'l4-ping-healthcheck', tool_name: 'ping',
    user_prompt: 'Check that the server is alive.',
    expected_args: [],
  },
]

function filterByQuery(layer: string | null, tool: string | null): ScenarioEntry[] {
  let entries: ScenarioEntry[] = FIXTURE
  if (layer) entries = entries.filter(e => e.layer === layer)
  if (tool)  entries = entries.filter(e => e.tool_name === tool)
  return entries
}

function renderPage(initialPath = '/scenarios') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <ScenariosPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockGetScenarios.mockReset()
  // Default mock: respect the params the page sends and filter the fixture
  // accordingly so the rendered count matches the URL's narrowing.
  mockGetScenarios.mockImplementation(async (params) => ({
    scenarios: filterByQuery(params?.layer ?? null, params?.tool ?? null),
  }))
})

// ---------------------------------------------------------------------------
// Initial render
// ---------------------------------------------------------------------------

describe('ScenariosPage — initial render', () => {
  // @blurb Default load (no URL params) fetches the unfiltered corpus and
  // @blurb renders one entry card per scenario across the per-tool groups.
  test('fetches unfiltered and renders every entry', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByTestId('scenarios-results')).toBeInTheDocument())
    expect(mockGetScenarios).toHaveBeenCalledWith({}, expect.any(AbortSignal))
    expect(screen.getAllByTestId('scenarios-entry')).toHaveLength(4)
    expect(screen.getByTestId('scenarios-count')).toHaveTextContent('4 scenarios matching')
  })
})

// ---------------------------------------------------------------------------
// URL deep-link
// ---------------------------------------------------------------------------

describe('ScenariosPage — URL deep-link', () => {
  // @blurb Loading with ?layer=l5&tool=bug_list initialises both filters
  // @blurb from the URL, refetches with those params (server-side narrow),
  // @blurb and renders the matching entry. Layer toggle + tool dropdown
  // @blurb both reflect the URL state for visual round-trip.
  test('?layer=l5&tool=bug_list deep-links to the L5 bug_list entry', async () => {
    renderPage('/scenarios?layer=l5&tool=bug_list')
    await waitFor(() => expect(screen.getByTestId('scenarios-results')).toBeInTheDocument())

    expect(mockGetScenarios).toHaveBeenCalledWith(
      { layer: 'l5', tool: 'bug_list' },
      expect.any(AbortSignal),
    )

    const layerToggles = screen.getByTestId('scenarios-layer-toggles')
    expect(layerToggles.querySelector('[data-layer="l5"]'))
      .toHaveAttribute('aria-pressed', 'true')
    expect(layerToggles.querySelector('[data-layer="all"]'))
      .toHaveAttribute('aria-pressed', 'false')

    expect(screen.getByTestId('scenarios-tool-select')).toHaveValue('bug_list')

    expect(screen.getAllByTestId('scenarios-entry')).toHaveLength(1)
    expect(screen.getAllByTestId('scenarios-entry')[0])
      .toHaveAttribute('data-id', 'l5-bl-open-count')
  })

  // @blurb Loading with an unrecognised ?layer value falls back to 'all'
  // @blurb (the default) rather than rendering an empty state — a corrupt
  // @blurb bookmark shouldn't lock the user out of seeing any scenarios.
  test('unrecognised layer param falls back to all', async () => {
    renderPage('/scenarios?layer=l99')
    await waitFor(() => expect(screen.getByTestId('scenarios-results')).toBeInTheDocument())

    expect(screen.getByTestId('scenarios-layer-toggles')
      .querySelector('[data-layer="all"]'))
      .toHaveAttribute('aria-pressed', 'true')
    // Fetch goes out unfiltered too (page treats invalid param as 'all').
    expect(mockGetScenarios).toHaveBeenCalledWith({}, expect.any(AbortSignal))
  })

  // @blurb ?q=… initialises the free-text search box; combined with layer
  // @blurb + tool params it should narrow the visible entries to the
  // @blurb intersection.
  test('?q=… initialises the search input', async () => {
    renderPage('/scenarios?q=open')
    await waitFor(() => expect(screen.getByTestId('scenarios-results')).toBeInTheDocument())
    expect(screen.getByTestId('scenarios-search')).toHaveValue('open')
  })
})

// ---------------------------------------------------------------------------
// Filter state syncs back to URL
// ---------------------------------------------------------------------------

describe('ScenariosPage — filter state syncs back to URL', () => {
  // @blurb Changing the layer toggle triggers a refetch with ?layer=… AND
  // @blurb updates the URL — back/forward survives the filter change.
  test('clicking a layer toggle refetches with ?layer= param', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getByTestId('scenarios-results')).toBeInTheDocument())
    expect(mockGetScenarios).toHaveBeenCalledTimes(1)

    await user.click(
      screen.getByTestId('scenarios-layer-toggles').querySelector('[data-layer="l6"]')!,
    )

    await waitFor(() => expect(mockGetScenarios).toHaveBeenCalledTimes(2))
    expect(mockGetScenarios).toHaveBeenLastCalledWith(
      { layer: 'l6' },
      expect.any(AbortSignal),
    )
  })

  // @blurb Selecting a specific tool from the dropdown refetches with
  // @blurb ?tool=…  but typing in the search box does NOT refetch
  // @blurb (search is client-side; corpus is small enough for in-memory filtering).
  test('search input updates client-side without refetching', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getByTestId('scenarios-results')).toBeInTheDocument())
    expect(mockGetScenarios).toHaveBeenCalledTimes(1)

    await user.type(screen.getByTestId('scenarios-search'), 'recharts')

    // No refetch fired.
    expect(mockGetScenarios).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// Error path
// ---------------------------------------------------------------------------

describe('ScenariosPage — error handling', () => {
  // @blurb When the corpus fetch rejects, the page renders the error in
  // @blurb the scenarios-error block and does NOT render the results area.
  test('renders the error message when fetch fails', async () => {
    mockGetScenarios.mockRejectedValueOnce(new Error('upstream down'))
    renderPage()
    await waitFor(() => expect(screen.getByTestId('scenarios-error')).toBeInTheDocument())
    expect(screen.getByTestId('scenarios-error')).toHaveTextContent('upstream down')
    expect(screen.queryByTestId('scenarios-results')).not.toBeInTheDocument()
  })
})
