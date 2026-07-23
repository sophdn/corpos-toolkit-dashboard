import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { StatsCard } from '.'
import type { ProjectStatsResponse } from '../../lib/projectStats'

const STATS: ProjectStatsResponse = {
  total_files: 1247,
  total_directories: 89,
  breakdown: {
    'process-docs/': { files: 43, subdirs: 7 },
    'tools/': { files: 3, subdirs: 14 },
  },
}

describe('StatsCard', () => {
  // @blurb The card title must always read "Full Project Stats" so users
  // @blurb immediately know the counts are project-wide, not scoped to the
  // @blurb currently browsed directory.
  it('renders the Full Project Stats title', () => {
    render(<StatsCard stats={STATS} />)
    expect(screen.getByText('Full Project Stats')).toBeInTheDocument()
  })

  // @blurb File count is the primary metric on the card — must be present
  // @blurb with the correct value so users can rely on it for orientation.
  it('renders total_files with locale formatting', () => {
    render(<StatsCard stats={STATS} />)
    const filesCell = screen.getByTestId('stats-files')
    expect(filesCell).toHaveTextContent('1,247')
    expect(filesCell).toHaveTextContent('files')
  })

  // @blurb Directory count pairs with file count to give a full size picture;
  // @blurb must be present alongside the correct label.
  it('renders total_directories with locale formatting', () => {
    render(<StatsCard stats={STATS} />)
    const dirsCell = screen.getByTestId('stats-dirs')
    expect(dirsCell).toHaveTextContent('89')
    expect(dirsCell).toHaveTextContent('directories')
  })

  // @blurb The card must carry a stable data-testid so Playwright and other
  // @blurb integration tests can reliably locate it without relying on text content.
  it('renders with data-testid project-stats-card', () => {
    render(<StatsCard stats={STATS} />)
    expect(screen.getByTestId('project-stats-card')).toBeInTheDocument()
  })

  // @blurb The per-directory breakdown is now part of the merged stats block;
  // @blurb the card must render a table row for each key in the breakdown object.
  it('renders a breakdown row for each entry', () => {
    render(<StatsCard stats={STATS} />)
    const rows = screen.getAllByTestId('breakdown-row')
    expect(rows).toHaveLength(Object.keys(STATS.breakdown).length)
    expect(screen.getByTestId('stats-breakdown')).toBeInTheDocument()
  })

  // @blurb An empty breakdown object must not render the table at all so the
  // @blurb card stays clean when stats are present but no directory data exists.
  it('does not render breakdown table when breakdown is empty', () => {
    const statsNoBreakdown = { ...STATS, breakdown: {} }
    render(<StatsCard stats={statsNoBreakdown} />)
    expect(screen.queryByTestId('stats-breakdown')).not.toBeInTheDocument()
  })

  // @blurb Clicking the caret collapses the breakdown so users can reclaim
  // @blurb vertical space while keeping the summary counts visible.
  it('collapses breakdown when toggle is clicked', async () => {
    render(<StatsCard stats={STATS} />)
    expect(screen.getByTestId('stats-breakdown')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('stats-toggle'))
    expect(screen.queryByTestId('stats-breakdown')).not.toBeInTheDocument()
  })

  // @blurb A second click re-expands the breakdown so the interaction is a
  // @blurb clean toggle rather than a one-way collapse.
  it('re-expands breakdown on second toggle click', async () => {
    render(<StatsCard stats={STATS} />)
    await userEvent.click(screen.getByTestId('stats-toggle'))
    await userEvent.click(screen.getByTestId('stats-toggle'))
    expect(screen.getByTestId('stats-breakdown')).toBeInTheDocument()
  })
})
