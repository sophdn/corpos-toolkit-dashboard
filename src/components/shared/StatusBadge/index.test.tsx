import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatusBadge } from '.'

describe('StatusBadge — data-status', () => {
  // @blurb Each lifecycle status must be reflected as a data attribute so CSS
  // @blurb selectors and tests can style and query badges without inspecting
  // @blurb text content, which is locale-sensitive.
  it.each([
    'pending', 'active', 'in-progress', 'closed', 'cancelled', 'blocked',
  ])('sets data-status="%s" on the element', status => {
    render(<StatusBadge status={status} />)
    expect(screen.getByTestId('status-badge')).toHaveAttribute('data-status', status)
  })

  // @blurb Unknown statuses must not be silently dropped — the raw value is
  // @blurb exposed for forward-compatibility when new lifecycle states are
  // @blurb introduced server-side before the UI is updated.
  it('preserves unknown status values in data-status', () => {
    render(<StatusBadge status="mystery" />)
    expect(screen.getByTestId('status-badge')).toHaveAttribute('data-status', 'mystery')
  })
})

describe('StatusBadge — labels', () => {
  // @blurb Human-readable labels map status machine values to display text —
  // @blurb verifies the full status→label mapping is correct and complete for
  // @blurb every known lifecycle state.
  it.each([
    ['pending',     'Pending'],
    ['active',      'Active'],
    ['in-progress', 'In progress'],
    ['closed',      'Closed'],
    ['cancelled',   'Cancelled'],
    ['blocked',     'Blocked'],
  ])('renders "%s" with text content "%s"', (status, label) => {
    render(<StatusBadge status={status} />)
    expect(screen.getByTestId('status-badge')).toHaveTextContent(label)
  })

  // @blurb Unrecognised statuses fall back to displaying their raw string
  // @blurb rather than a misleading label or an empty badge.
  it('renders unknown status as its raw value', () => {
    render(<StatusBadge status="mystery" />)
    expect(screen.getByTestId('status-badge')).toHaveTextContent('mystery')
  })
})

describe('StatusBadge — variant', () => {
  // @blurb When no variant prop is supplied, badge is the default — the larger
  // @blurb form suited for standalone status displays in tables and detail panels.
  it('defaults to badge variant', () => {
    render(<StatusBadge status="pending" />)
    expect(screen.getByTestId('status-badge')).toHaveAttribute('data-variant', 'badge')
  })

  // @blurb The chip variant (smaller, inline) must be activatable via prop for
  // @blurb use in tight layouts like chain row meta and search result items.
  it('sets data-variant="chip" when chip is specified', () => {
    render(<StatusBadge status="pending" variant="chip" />)
    expect(screen.getByTestId('status-badge')).toHaveAttribute('data-variant', 'chip')
  })

  // @blurb Visual distinction between badge and chip must be enforced at the
  // @blurb CSS class level — if both variants share an identical class string
  // @blurb the CSS rules would collide and one style would silently win.
  it('badge and chip variants produce different class strings', () => {
    const { rerender, container } = render(<StatusBadge status="active" variant="badge" />)
    const badgeClass = (container.firstChild as HTMLElement).className

    rerender(<StatusBadge status="active" variant="chip" />)
    const chipClass = (container.firstChild as HTMLElement).className

    expect(badgeClass).not.toBe(chipClass)
  })
})
