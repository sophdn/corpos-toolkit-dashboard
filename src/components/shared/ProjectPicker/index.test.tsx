import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectPicker } from './index'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ProjectPicker', () => {
  it('renders the all-projects sentinel even when /projects fails', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('{"error":"db down"}', { status: 500 }),
    )
    // Bug 1430: failure path logs a warn; silence it in this test so
    // vitest output stays clean.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(<ProjectPicker value="" onChange={() => {}} />)
    expect(screen.getByTestId('project-picker')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'All projects' })).toBeInTheDocument()
    // Bug 1432: await the post-rejection setLoading(false) so React
    // commits the async setState inside an act boundary.
    await waitFor(() => {
      expect(screen.getByTestId('project-picker-select')).not.toBeDisabled()
    })
    warnSpy.mockRestore()
  })

  it('lists registered projects from /projects', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          { id: 'seed-packet', name: 'Seed Packet', path: '', created_at: '' },
          { id: 'mcp-servers', name: 'MCP Servers', path: '', created_at: '' },
        ]),
        { status: 200 },
      ),
    )
    render(<ProjectPicker value="" onChange={() => {}} />)
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Seed Packet' })).toBeInTheDocument()
    })
    expect(screen.getByRole('option', { name: 'MCP Servers' })).toBeInTheDocument()
  })

  it('selecting an option fires onChange with the picked project', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify([{ id: 'seed-packet', name: 'Seed Packet', path: '', created_at: '' }]),
        { status: 200 },
      ),
    )
    const onChange = vi.fn()
    render(<ProjectPicker value="" onChange={onChange} />)
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Seed Packet' })).toBeInTheDocument()
    })
    const select = screen.getByTestId('project-picker-select') as HTMLSelectElement
    await userEvent.selectOptions(select, 'seed-packet')
    expect(onChange).toHaveBeenCalledWith('seed-packet')
  })

  it('reflects the supplied value as the selected option', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify([{ id: 'seed-packet', name: 'Seed Packet', path: '', created_at: '' }]),
        { status: 200 },
      ),
    )
    render(<ProjectPicker value="seed-packet" onChange={() => {}} />)
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Seed Packet' })).toBeInTheDocument()
    })
    const select = screen.getByTestId('project-picker-select') as HTMLSelectElement
    expect(select.value).toBe('seed-packet')
  })
})
