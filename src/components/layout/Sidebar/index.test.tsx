import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { Sidebar } from '.'

// CHARACTERIZATION NET — chain telemetry-page-ia-unification (Chain 4).
// Pins the sectioned nav IA (user-vetted Option A, docs/CHAIN4_PAGE_IA_DESIGN.md
// §T3): six labelled sections, with the read-side TELEMETRY section sitting next
// to the write-side AUDIT section. The flat 17-link list this replaced is in the
// git history of this file (the diff is the record of what moved + renamed).

function renderSidebar() {
  return render(
    <MemoryRouter>
      <Sidebar />
    </MemoryRouter>,
  )
}

describe('Sidebar nav IA — sectioned (read-side TELEMETRY vs write-side AUDIT)', () => {
  it('renders the six section headings in order', () => {
    renderSidebar()
    const headings = screen.getAllByRole('heading').map((h) => h.textContent?.trim())
    expect(headings).toEqual([
      'Work',
      'Telemetry',
      'Audit',
      'Knowledge',
      'ML / Benchmarks',
      'Admin',
    ])
  })

  it('pins each section to its links (label + href), in order', () => {
    renderSidebar()
    const linksUnder = (heading: string): Array<[string | undefined, string | null]> => {
      // The section is the nearest container that holds both the heading and its
      // links — walk up from the heading to its parent <div className=section>.
      const section = screen.getByRole('heading', { name: heading }).parentElement as HTMLElement
      return within(section)
        .getAllByRole('link')
        .map((l) => [l.textContent?.trim(), l.getAttribute('href')])
    }

    expect(linksUnder('Work')).toEqual([
      ['Chains & Tasks', '/tasks/chains'],
      ['Roadmap', '/roadmap'],
      ['Bug Index', '/bugs'],
      ['Suggestion Index', '/suggestions'],
    ])
    // Read-side observability cluster — inference + retrieval grouped together.
    expect(linksUnder('Telemetry')).toEqual([
      ['Inference', '/inference'],
      ['Model Ranking', '/telemetry/model-ranking'],
      ['Search Analytics', '/telemetry'],
      ['Context Pulls', '/context-pulls'],
      ['Training Pairs', '/telemetry/training-pairs'],
      ['Snapshot Corpus', '/telemetry/snapshot-corpus'],
    ])
    // Write-side ledger.
    expect(linksUnder('Audit')).toEqual([
      ['Audit Ledger', '/audit'],
      ['Live Spans', '/spans'],
    ])
    expect(linksUnder('Knowledge')).toEqual([
      ['Knowledge Index', '/knowledge'],
      ['Memory Substrate', '/knowledge/memory-substrate'],
    ])
    expect(linksUnder('ML / Benchmarks')).toEqual([
      ['Local LLM Task Performance', '/benchmarks'],
      ['Assays', '/assays'],
      ['Deferred Ports', '/deferred-ports'],
    ])
    expect(linksUnder('Admin')).toEqual([
      ['Dispatch Policy', '/admin/dispatch-policy'],
      ['Action Docs', '/docs/actions'],
    ])
  })

  it('no longer carries the misleading "Telemetry Analytics" / "Qwen Inference" labels', () => {
    renderSidebar()
    expect(screen.queryByText('Telemetry Analytics')).toBeNull()
    expect(screen.queryByText('Qwen Inference')).toBeNull()
  })
})
