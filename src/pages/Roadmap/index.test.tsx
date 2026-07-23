import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { RoadmapPage, chainIndexHref } from './index'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

function mockRoadmapResponse(roadmap: unknown, diff: unknown, projects: unknown = []) {
  fetchMock.mockImplementation((url: string) => {
    if (url.endsWith('/roadmap/diff')) {
      return Promise.resolve(new Response(JSON.stringify(diff), { status: 200 }))
    }
    if (url.endsWith('/roadmap')) {
      return Promise.resolve(new Response(JSON.stringify(roadmap), { status: 200 }))
    }
    if (url.endsWith('/projects')) {
      return Promise.resolve(new Response(JSON.stringify(projects), { status: 200 }))
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`))
  })
}

function renderPage() {
  return render(
    <MemoryRouter>
      <RoadmapPage />
    </MemoryRouter>,
  )
}

describe('chainIndexHref', () => {
  it('routes a chain row to ?chain=<slug>', () => {
    expect(
      chainIndexHref({ ref_kind: 'chain', ref_slug: 'foo-bar', chain_slug: null }),
    ).toBe('/tasks/chains?chain=foo-bar')
  })

  it('routes a task row with chain context to ?chain=&task=', () => {
    expect(
      chainIndexHref({
        ref_kind: 'task',
        ref_slug: 'fix-the-thing',
        chain_slug: 'parent-chain',
      }),
    ).toBe('/tasks/chains?chain=parent-chain&task=fix-the-thing')
  })

  it('falls back to ?task= when a task row lacks chain context', () => {
    expect(
      chainIndexHref({ ref_kind: 'task', ref_slug: 'orphan', chain_slug: null }),
    ).toBe('/tasks/chains?task=orphan')
  })

  it('URL-encodes slugs that contain reserved characters', () => {
    expect(
      chainIndexHref({ ref_kind: 'chain', ref_slug: 'has/slash', chain_slug: null }),
    ).toBe('/tasks/chains?chain=has%2Fslash')
  })
})

describe('RoadmapPage', () => {
  it('renders empty states when both panels are empty', async () => {
    mockRoadmapResponse([], { chains: [], tasks: [] })
    renderPage()
    await waitFor(() => {
      expect(screen.getByTestId('roadmap-ordered-empty')).toBeInTheDocument()
    })
    expect(screen.getByTestId('roadmap-diff-empty')).toBeInTheDocument()
  })

  it('renders ordered rows in position order with joined status and chain context', async () => {
    mockRoadmapResponse(
      [
        {
          position: 1,
          project_id: 'mcp-servers',
          ref_kind: 'chain',
          ref_slug: 'first-chain',
          chain_slug: null,
          note: 'top priority',
          status: 'open',
          updated_at: '2026-05-05',
        },
        {
          position: 2,
          project_id: 'mcp-servers',
          ref_kind: 'task',
          ref_slug: 'follow-up-task',
          chain_slug: 'first-chain',
          note: null,
          status: 'pending',
          updated_at: '2026-05-05',
        },
      ],
      { chains: [], tasks: [] },
    )
    renderPage()
    await waitFor(() => {
      expect(screen.getAllByTestId('roadmap-row')).toHaveLength(2)
    })
    const rows = screen.getAllByTestId('roadmap-row')
    expect(rows[0]).toHaveTextContent('first-chain')
    expect(rows[0]).toHaveTextContent('top priority')
    expect(rows[1]).toHaveTextContent('follow-up-task')
    expect(rows[1]).toHaveTextContent('first-chain')
    expect(rows[1]).toHaveTextContent('pending')
  })

  it('renders ordered-row slugs as links pointing at /tasks/chains with the right query', async () => {
    mockRoadmapResponse(
      [
        {
          position: 1,
          project_id: 'mcp-servers',
          ref_kind: 'chain',
          ref_slug: 'first-chain',
          chain_slug: null,
          note: null,
          status: 'open',
          updated_at: '2026-05-05',
        },
        {
          position: 2,
          project_id: 'mcp-servers',
          ref_kind: 'task',
          ref_slug: 'follow-up-task',
          chain_slug: 'first-chain',
          note: null,
          status: 'pending',
          updated_at: '2026-05-05',
        },
      ],
      { chains: [], tasks: [] },
    )
    renderPage()
    await waitFor(() => {
      expect(screen.getAllByTestId('roadmap-row-slug-link')).toHaveLength(2)
    })
    const links = screen.getAllByTestId('roadmap-row-slug-link') as HTMLAnchorElement[]
    expect(links[0]).toHaveAttribute('href', '/tasks/chains?chain=first-chain')
    expect(links[1]).toHaveAttribute(
      'href',
      '/tasks/chains?chain=first-chain&task=follow-up-task',
    )
    // The Chain column on a task row also links to the parent chain.
    const chainLink = screen.getByTestId('roadmap-row-chain-link') as HTMLAnchorElement
    expect(chainLink).toHaveAttribute('href', '/tasks/chains?chain=first-chain')
  })

  it('renders unplaced chains and tasks under the diff panel with creation timestamps', async () => {
    mockRoadmapResponse(
      [],
      {
        chains: [
          { slug: 'forged-chain', project_id: 'seed-packet', created_at: '2026-05-05', chain_slug: null },
        ],
        tasks: [
          { slug: 'forged-task', project_id: 'mcp-servers', created_at: '2026-05-05', chain_slug: 'parent' },
        ],
      },
    )
    renderPage()
    await waitFor(() => {
      expect(screen.getByTestId('roadmap-diff-chain')).toBeInTheDocument()
    })
    expect(screen.getByTestId('roadmap-diff-chain')).toHaveTextContent('forged-chain')
    expect(screen.getByTestId('roadmap-diff-chain')).toHaveTextContent('seed-packet')
    expect(screen.getByTestId('roadmap-diff-task')).toHaveTextContent('forged-task')
    expect(screen.getByTestId('roadmap-diff-task')).toHaveTextContent('mcp-servers')
  })

  it('renders diff slugs as links into /tasks/chains', async () => {
    mockRoadmapResponse(
      [],
      {
        chains: [
          { slug: 'forged-chain', project_id: 'seed-packet', created_at: '2026-05-05', chain_slug: null },
        ],
        tasks: [
          { slug: 'forged-task', project_id: 'mcp-servers', created_at: '2026-05-05', chain_slug: 'parent-chain' },
        ],
      },
    )
    renderPage()
    await waitFor(() => {
      expect(screen.getByTestId('roadmap-diff-chain-link')).toBeInTheDocument()
    })
    const chainLink = screen.getByTestId('roadmap-diff-chain-link') as HTMLAnchorElement
    expect(chainLink).toHaveAttribute('href', '/tasks/chains?chain=forged-chain')
    const taskLink = screen.getByTestId('roadmap-diff-task-link') as HTMLAnchorElement
    expect(taskLink).toHaveAttribute(
      'href',
      '/tasks/chains?chain=parent-chain&task=forged-task',
    )
  })

  it('does not render any row-mutation affordances (read-only by design)', async () => {
    mockRoadmapResponse(
      [
        {
          position: 1,
          project_id: 'mcp-servers',
          ref_kind: 'chain',
          ref_slug: 'a',
          chain_slug: null,
          note: null,
          status: 'open',
          updated_at: '2026-05-05',
        },
      ],
      { chains: [], tasks: [] },
    )
    const { container } = renderPage()
    await waitFor(() => {
      expect(screen.getByTestId('roadmap-ordered')).toBeInTheDocument()
    })
    expect(container.querySelector('button')).toBeNull()
    expect(container.querySelector('input')).toBeNull()
    expect(container.querySelector('form')).toBeNull()
  })

  it('filters both panels by the project picker selection', async () => {
    mockRoadmapResponse(
      [
        {
          position: 1,
          project_id: 'mcp-servers',
          ref_kind: 'chain',
          ref_slug: 'keep-me',
          chain_slug: null,
          note: null,
          status: 'open',
          updated_at: '2026-05-05',
        },
        {
          position: 2,
          project_id: 'seed-packet',
          ref_kind: 'chain',
          ref_slug: 'hide-me',
          chain_slug: null,
          note: null,
          status: 'open',
          updated_at: '2026-05-05',
        },
      ],
      {
        chains: [
          { slug: 'unplaced-keep', project_id: 'mcp-servers', created_at: '2026-05-05', chain_slug: null },
          { slug: 'unplaced-hide', project_id: 'seed-packet', created_at: '2026-05-05', chain_slug: null },
        ],
        tasks: [
          { slug: 'task-keep', project_id: 'mcp-servers', created_at: '2026-05-05', chain_slug: 'keep-me' },
          { slug: 'task-hide', project_id: 'seed-packet', created_at: '2026-05-05', chain_slug: 'hide-me' },
        ],
      },
      [
        { id: 'mcp-servers', name: 'mcp-servers' },
        { id: 'seed-packet', name: 'seed-packet' },
      ],
    )
    renderPage()
    await waitFor(() => {
      expect(screen.getAllByTestId('roadmap-row')).toHaveLength(2)
    })

    fireEvent.change(screen.getByTestId('project-picker-select'), {
      target: { value: 'mcp-servers' },
    })

    await waitFor(() => {
      expect(screen.getAllByTestId('roadmap-row')).toHaveLength(1)
    })
    expect(screen.getByTestId('roadmap-row')).toHaveTextContent('keep-me')
    const diffChains = screen.getAllByTestId('roadmap-diff-chain')
    expect(diffChains).toHaveLength(1)
    expect(diffChains[0]).toHaveTextContent('unplaced-keep')
    const diffTasks = screen.getAllByTestId('roadmap-diff-task')
    expect(diffTasks).toHaveLength(1)
    expect(diffTasks[0]).toHaveTextContent('task-keep')
  })
})
