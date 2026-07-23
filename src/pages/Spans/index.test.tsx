import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSpanStream, type SpanEvent } from '../../hooks/useSpanStream'
import { SpansPanel } from '.'

vi.mock('../../hooks/useSpanStream', () => ({
  useSpanStream: vi.fn(),
}))

const mockStream = vi.mocked(useSpanStream)

const open = (overrides: Partial<SpanEvent> = {}): SpanEvent => ({
  type: 'span_open',
  span_id: 'span-default',
  trace_id: 'trace-default',
  name: 'default.handler',
  started_at: '2026-05-17T12:00:00.000Z',
  ...overrides,
})

beforeEach(() => mockStream.mockReset())
afterEach(() => vi.clearAllMocks())

function renderWith(path: string, events: SpanEvent[]) {
  mockStream.mockReturnValue(events)
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SpansPanel />
    </MemoryRouter>,
  )
}

describe('SpansPanel — no-filter default', () => {
  it('renders all traces when no ?span_id= is set', () => {
    renderWith('/spans', [
      open({ span_id: 's1', trace_id: 't1' }),
      open({ span_id: 's2', trace_id: 't2' }),
    ])
    expect(screen.getByTestId('spans-panel-trace-list')).toBeInTheDocument()
    expect(screen.getByTestId('spans-panel-trace-t1')).toBeInTheDocument()
    expect(screen.getByTestId('spans-panel-trace-t2')).toBeInTheDocument()
  })

  it('renders the no-spans-yet empty state when buffer is empty', () => {
    renderWith('/spans', [])
    expect(screen.getByTestId('spans-panel-empty')).toBeInTheDocument()
  })
})

describe('SpansPanel — focused span present in buffer', () => {
  it('filters to traces containing the focused span', () => {
    renderWith('/spans?span_id=s1', [
      open({ span_id: 's1', trace_id: 't1' }),
      open({ span_id: 's2', trace_id: 't2' }),
    ])
    expect(screen.getByTestId('spans-panel-trace-t1')).toBeInTheDocument()
    expect(screen.queryByTestId('spans-panel-trace-t2')).toBeNull()
  })

  it('renders the focused-trace filter banner', () => {
    renderWith('/spans?span_id=s1', [
      open({ span_id: 's1', trace_id: 't1' }),
    ])
    expect(screen.getByTestId('spans-panel-focus-banner').textContent).toMatch(
      /Filtered to span s1/,
    )
  })

  it('marks the focused span with the highlight attribute', () => {
    renderWith('/spans?span_id=s1', [
      open({ span_id: 's1', trace_id: 't1' }),
    ])
    expect(screen.getByTestId('spans-panel-highlighted-span')).toBeInTheDocument()
  })

  it('highlights a child span when the focused id is a child of the trace root', () => {
    renderWith('/spans?span_id=child-1', [
      open({ span_id: 'root-1', trace_id: 't1' }),
      open({
        span_id: 'child-1',
        trace_id: 't1',
        parent_span_id: 'root-1',
        name: 'child.handler',
        started_at: '2026-05-17T12:00:00.100Z',
      }),
    ])
    expect(screen.getByTestId('spans-panel-trace-t1')).toBeInTheDocument()
    expect(screen.getByTestId('spans-panel-highlighted-span')).toBeInTheDocument()
  })
})

describe('SpansPanel — focused span NOT in buffer', () => {
  it('renders the not-in-buffer empty-state instead of the full tree', () => {
    renderWith('/spans?span_id=missing-span', [
      open({ span_id: 's1', trace_id: 't1' }),
    ])
    expect(
      screen.getByTestId('spans-panel-focused-not-in-buffer'),
    ).toBeInTheDocument()
    // The full tree is suppressed when we're showing the empty state.
    expect(screen.queryByTestId('spans-panel-trace-list')).toBeNull()
  })

  it('renders a copy-to-clipboard button surfacing the focused id', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    renderWith('/spans?span_id=missing-span', [
      open({ span_id: 's1', trace_id: 't1' }),
    ])
    const btn = screen.getByTestId('spans-panel-copy-span-id')
    fireEvent.click(btn)
    expect(writeText).toHaveBeenCalledWith('missing-span')
  })

  it('shows the focused id inside the empty-state copy', () => {
    renderWith('/spans?span_id=missing-span', [
      open({ span_id: 's1', trace_id: 't1' }),
    ])
    expect(
      screen.getByTestId('spans-panel-focused-not-in-buffer').textContent,
    ).toMatch(/missing-span/)
  })
})

describe('SpansPanel — empty span_id query param', () => {
  it('treats ?span_id= (empty value) as no filter', () => {
    renderWith('/spans?span_id=', [
      open({ span_id: 's1', trace_id: 't1' }),
      open({ span_id: 's2', trace_id: 't2' }),
    ])
    expect(screen.queryByTestId('spans-panel-focus-banner')).toBeNull()
    expect(screen.getByTestId('spans-panel-trace-t1')).toBeInTheDocument()
    expect(screen.getByTestId('spans-panel-trace-t2')).toBeInTheDocument()
  })
})
