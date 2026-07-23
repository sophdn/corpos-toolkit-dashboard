import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ALL_PROJECTS, useProject, withProjectQuery } from './useProject'

describe('useProject', () => {
  it('defaults to the ALL_PROJECTS sentinel', () => {
    const { result } = renderHook(() => useProject())
    expect(result.current[0]).toBe(ALL_PROJECTS)
  })

  it('updating the value re-renders with the new project', () => {
    const { result, rerender } = renderHook(() => useProject())
    act(() => {
      result.current[1]('seed-packet')
    })
    expect(result.current[0]).toBe('seed-packet')
    rerender()
    expect(result.current[0]).toBe('seed-packet')
  })

  it('two consumers each hold independent state — no cross-page leakage', () => {
    const a = renderHook(() => useProject())
    const b = renderHook(() => useProject())
    act(() => {
      a.result.current[1]('mcp-servers')
    })
    expect(a.result.current[0]).toBe('mcp-servers')
    expect(b.result.current[0]).toBe(ALL_PROJECTS)
  })
})

describe('withProjectQuery', () => {
  it('appends ?project=... when path has no query', () => {
    expect(withProjectQuery('/chains', 'seed-packet')).toBe('/chains?project=seed-packet')
  })

  it('appends &project=... when path already has a query', () => {
    expect(withProjectQuery('/bugs?status=open', 'mcp-servers')).toBe(
      '/bugs?status=open&project=mcp-servers',
    )
  })

  it('returns the path unchanged when project is the all-projects sentinel', () => {
    expect(withProjectQuery('/chains', '')).toBe('/chains')
  })

  it('returns the path unchanged when project is undefined', () => {
    expect(withProjectQuery('/chains', undefined)).toBe('/chains')
  })

  it('encodes special characters in the project value', () => {
    expect(withProjectQuery('/chains', 'two words')).toBe('/chains?project=two%20words')
  })
})
