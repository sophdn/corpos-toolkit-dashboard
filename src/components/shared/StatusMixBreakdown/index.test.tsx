import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatusMixBreakdown } from '.'

describe('StatusMixBreakdown', () => {
  it('renders one chip per status in the supplied order', () => {
    render(
      <StatusMixBreakdown
        statusOrder={['open', 'adopted', 'deferred', 'rejected']}
        counts={{ open: 2, adopted: 1, deferred: 0, rejected: 3 }}
      />,
    )
    const chips = screen.getAllByTestId('resolution-chip')
    expect(chips.map(c => c.getAttribute('data-status'))).toEqual([
      'open',
      'adopted',
      'deferred',
      'rejected',
    ])
  })

  it('renders the count from the counts map', () => {
    render(
      <StatusMixBreakdown
        statusOrder={['open']}
        counts={{ open: 42 }}
      />,
    )
    expect(screen.getByTestId('resolution-count')).toHaveTextContent('42')
  })

  it('renders 0 for a status missing from the counts map', () => {
    render(
      <StatusMixBreakdown
        statusOrder={['open', 'closed']}
        counts={{ open: 1 }}
      />,
    )
    const counts = screen.getAllByTestId('resolution-count').map(c => c.textContent)
    expect(counts).toEqual(['1', '0'])
  })

  it('honors a custom test id for the outer wrapper', () => {
    render(
      <StatusMixBreakdown
        statusOrder={['open']}
        counts={{ open: 1 }}
        testId="suggestion-mix-breakdown"
      />,
    )
    expect(screen.getByTestId('suggestion-mix-breakdown')).toBeInTheDocument()
  })

  it('uses resolution-breakdown as the default outer test id', () => {
    render(<StatusMixBreakdown statusOrder={['open']} counts={{ open: 0 }} />)
    expect(screen.getByTestId('resolution-breakdown')).toBeInTheDocument()
  })
})
