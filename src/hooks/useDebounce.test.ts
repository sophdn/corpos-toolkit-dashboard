import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDebounce } from './useDebounce'

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // @blurb The initial value must be available synchronously on first render so
  // @blurb consumers do not flash a blank or stale state before the hook settles.
  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('hello', 300))
    expect(result.current).toBe('hello')
  })

  // @blurb Rapid value changes must not propagate until the quiet period ends —
  // @blurb this is the core invariant preventing partial-keystroke API calls
  // @blurb and expensive re-renders on every character typed.
  it('does not update before delay elapses', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useDebounce(value, 300),
      { initialProps: { value: 'a' } },
    )

    rerender({ value: 'b' })
    act(() => { vi.advanceTimersByTime(299) })
    expect(result.current).toBe('a')
  })

  // @blurb Once the full delay elapses after the last change, the debounced
  // @blurb value must catch up exactly to the latest input rather than an
  // @blurb intermediate or stale value.
  it('updates after delay elapses', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useDebounce(value, 300),
      { initialProps: { value: 'a' } },
    )

    rerender({ value: 'b' })
    act(() => { vi.advanceTimersByTime(300) })
    expect(result.current).toBe('b')
  })

  // @blurb Each new value change resets the timer from zero so only the final
  // @blurb settled value propagates — without this an intermediate value would
  // @blurb fire during a burst of rapid changes.
  it('resets the timer when value changes again before delay', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useDebounce(value, 300),
      { initialProps: { value: 'a' } },
    )

    rerender({ value: 'b' })
    act(() => { vi.advanceTimersByTime(200) })
    rerender({ value: 'c' })
    act(() => { vi.advanceTimersByTime(200) })
    // Only 200ms since last change — should still be 'a'
    expect(result.current).toBe('a')

    act(() => { vi.advanceTimersByTime(100) })
    // Now 300ms since 'c' was set
    expect(result.current).toBe('c')
  })
})
