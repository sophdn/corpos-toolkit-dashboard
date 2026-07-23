import { renderHook, act } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useTheme } from './useTheme'

afterEach(() => {
  document.documentElement.removeAttribute('data-theme')
})

describe('useTheme', () => {
  // @blurb Dark is the application's default theme — verifies no external config,
  // @blurb localStorage, or OS preference is needed to establish the initial state
  // @blurb on a cold load.
  it('initializes with dark theme by default', () => {
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('dark')
  })

  // @blurb Theme must be applied via the document root's data-theme attribute
  // @blurb so CSS custom properties cascade to every component in the tree
  // @blurb without additional prop threading.
  it('sets data-theme="dark" on document root at init', () => {
    renderHook(() => useTheme())
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  })

  // @blurb A single toggle must flip both the internal React state and the DOM
  // @blurb attribute to light simultaneously — if they diverge the theming cascade
  // @blurb breaks silently.
  it('toggleTheme switches to light', () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.toggleTheme())
    expect(result.current.theme).toBe('light')
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
  })

  // @blurb Two toggles must round-trip back to dark with no residual light-mode
  // @blurb state, confirming the toggle is a clean boolean inversion rather than
  // @blurb an accumulating event listener.
  it('toggleTheme twice returns to dark', () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.toggleTheme())
    act(() => result.current.toggleTheme())
    expect(result.current.theme).toBe('dark')
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  })

  // @blurb Consumers can override the default initial theme to light — used in
  // @blurb tests that need a specific starting state and for future per-page
  // @blurb theme overrides.
  it('accepts a custom initial theme of light', () => {
    const { result } = renderHook(() => useTheme('light'))
    expect(result.current.theme).toBe('light')
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
  })
})
