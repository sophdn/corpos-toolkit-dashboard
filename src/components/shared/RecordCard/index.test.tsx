import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RecordCard } from '.'
import type { RecordIndexRow } from '../../../lib/recordIndex'

const row = (overrides: Partial<RecordIndexRow> = {}): RecordIndexRow => ({
  slug: 'b-1',
  title: 'Sample row',
  status: 'open',
  surface: 'a,b',
  filed_at: '2026-05-21T00:00:00Z',
  resolved_at: null,
  project_id: 'mcp-servers',
  ...overrides,
})

describe('RecordCard', () => {
  it('renders title, slug, project badge, and status badge', () => {
    render(<RecordCard row={row()} testId="bug-row" />)
    expect(screen.getByText('Sample row')).toBeInTheDocument()
    expect(screen.getByText('b-1')).toBeInTheDocument()
    expect(screen.getByTestId('record-project-badge')).toHaveTextContent('mcp-servers')
    expect(screen.getByTestId('status-badge')).toHaveAttribute('data-status', 'open')
  })

  it('renders one surface tag per comma-separated entry', () => {
    render(<RecordCard row={row({ surface: 'one,two,three' })} testId="bug-row" />)
    const tags = screen.getAllByTestId('surface-tag').map(el => el.textContent)
    expect(tags).toEqual(['one', 'two', 'three'])
  })

  it('renders the leadChip in the tag row when supplied', () => {
    render(
      <RecordCard
        row={row()}
        testId="bug-row"
        leadChip={<span data-testid="lead-chip">high</span>}
      />,
    )
    expect(screen.getByTestId('lead-chip')).toHaveTextContent('high')
  })

  it('applies the custom slug attribute name when provided', () => {
    render(
      <RecordCard
        row={row()}
        testId="bug-row"
        slugAttrName="data-bug-slug"
      />,
    )
    const card = screen.getByTestId('bug-row')
    expect(card).toHaveAttribute('data-bug-slug', 'b-1')
    expect(card).not.toHaveAttribute('data-record-slug')
  })

  it('falls back to data-record-slug when no custom attribute name provided', () => {
    render(<RecordCard row={row()} testId="bug-row" />)
    expect(screen.getByTestId('bug-row')).toHaveAttribute('data-record-slug', 'b-1')
  })

  it('fires onSelect with the row when clicked', () => {
    const onSelect = vi.fn()
    render(<RecordCard row={row()} testId="bug-row" onSelect={onSelect} />)
    fireEvent.click(screen.getByTestId('bug-row'))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ slug: 'b-1' }))
  })

  it('reflects selected=true via aria-selected', () => {
    render(<RecordCard row={row()} testId="bug-row" selected />)
    expect(screen.getByTestId('bug-row')).toHaveAttribute('aria-selected', 'true')
  })

  it('renders the numeric id as a #-prefixed chip when present', () => {
    render(<RecordCard row={row({ id: 1156 })} testId="bug-row" />)
    expect(screen.getByTestId('record-id')).toHaveTextContent('#1156')
  })

  it('omits the id chip for id-less rows (e.g. study runs)', () => {
    render(<RecordCard row={row()} testId="bug-row" />)
    expect(screen.queryByTestId('record-id')).not.toBeInTheDocument()
  })
})
