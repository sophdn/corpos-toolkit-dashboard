import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { TaskDetail } from '.'

const BASE = { taskSlug: 'port-get-chain-state', taskStatus: 'active', chainSlug: 'work-port-tier2-reads' }

describe('TaskDetail', () => {
  // @blurb Renders the task slug, chain slug, and status label — the minimum set always
  // @blurb present regardless of which optional props are passed.
  test('renders slug, chain, and status label', () => {
    render(<TaskDetail {...BASE} />)
    expect(screen.getByTestId('task-detail-slug').textContent).toBe('port-get-chain-state')
    expect(screen.getByTestId('task-detail-chain').textContent).toBe('work-port-tier2-reads')
    expect(screen.getByText('Status')).toBeInTheDocument()
  })

  // @blurb Problem statement section appears when the prop is provided and is absent entirely
  // @blurb (no heading or empty paragraph) when the prop is omitted, keeping the layout clean.
  test('shows problem statement when provided, omits it when absent', () => {
    const { rerender } = render(<TaskDetail {...BASE} problemStatement="Do the thing." />)
    expect(screen.getByTestId('task-detail-problem-statement').textContent).toBe('Do the thing.')

    rerender(<TaskDetail {...BASE} />)
    expect(screen.queryByTestId('task-detail-problem-statement')).toBeNull()
  })

  // @blurb Field meta row appears when the field prop is passed (search context) and is hidden
  // @blurb entirely when absent so non-search callers don't see a spurious row.
  test('shows field row when provided, hides it when absent', () => {
    const { rerender } = render(<TaskDetail {...BASE} field="problem_statement" />)
    expect(screen.getByTestId('task-detail-field').textContent).toBe('problem_statement')

    rerender(<TaskDetail {...BASE} />)
    expect(screen.queryByTestId('task-detail-field')).toBeNull()
  })

  // @blurb Snippet section renders with <mark> elements for the matching query term when
  // @blurb both snippet and highlightQuery are provided, wiring highlightSnippet correctly.
  test('renders highlighted snippet when snippet and highlightQuery are provided', () => {
    render(
      <TaskDetail
        {...BASE}
        snippet="…Port get_chain_state end-to-end…"
        highlightQuery="port"
      />,
    )
    const snippetEl = screen.getByTestId('task-detail-snippet')
    expect(snippetEl).toBeInTheDocument()
    expect(snippetEl.querySelector('mark')).toBeTruthy()
  })

  // @blurb Snippet section is absent when no snippet is given, avoiding an empty
  // @blurb 'Matched excerpt' heading in non-search contexts like the planning dash.
  test('omits snippet section when snippet is absent', () => {
    render(<TaskDetail {...BASE} />)
    expect(screen.queryByTestId('task-detail-snippet')).toBeNull()
  })

  // @blurb Go to planning dash button is rendered and fires the callback on click,
  // @blurb enabling navigation from Work Search back to the planning dash with context.
  test('renders go-to-planning button and calls callback on click', () => {
    const onGo = vi.fn()
    render(<TaskDetail {...BASE} onGoToPlanning={onGo} />)
    const btn = screen.getByTestId('go-to-planning')
    expect(btn).toBeInTheDocument()
    fireEvent.click(btn)
    expect(onGo).toHaveBeenCalledOnce()
  })

  // @blurb Go to planning dash button is absent when onGoToPlanning is not provided,
  // @blurb since the button is meaningless when the user is already on the planning dash.
  test('omits go-to-planning button when onGoToPlanning is absent', () => {
    render(<TaskDetail {...BASE} />)
    expect(screen.queryByTestId('go-to-planning')).toBeNull()
  })
})
