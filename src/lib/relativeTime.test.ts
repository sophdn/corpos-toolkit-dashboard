import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatRelativeTime } from './relativeTime'

// Pins the extracted shared formatter across its input-classes. Previously this
// logic was duplicated (untested directly) inside two pages; the extraction gives
// it one home and one net.

const NOW = Date.parse('2026-05-27T12:00:00Z')

afterEach(() => {
  vi.useRealTimers()
})

function at(now: number) {
  vi.useFakeTimers()
  vi.setSystemTime(now)
}

describe('formatRelativeTime', () => {
  it('returns "never" for null', () => {
    expect(formatRelativeTime(null)).toBe('never')
  })

  it('returns the raw string when the timestamp is unparseable', () => {
    expect(formatRelativeTime('not-a-date')).toBe('not-a-date')
  })

  it('formats seconds below the 1-minute boundary', () => {
    at(NOW)
    expect(formatRelativeTime('2026-05-27 11:59:30')).toBe('30s ago')
  })

  it('formats minutes below the 1-hour boundary', () => {
    at(NOW)
    expect(formatRelativeTime('2026-05-27 11:30:00')).toBe('30m ago')
  })

  it('formats hours below the 1-day boundary', () => {
    at(NOW)
    expect(formatRelativeTime('2026-05-27 06:00:00')).toBe('6h ago')
  })

  it('formats days at and beyond the 1-day boundary', () => {
    at(NOW)
    expect(formatRelativeTime('2026-05-25 12:00:00')).toBe('2d ago')
  })

  it('treats the SQLite datetime as UTC (no local-tz drift)', () => {
    at(Date.parse('2026-05-27T12:00:30Z'))
    expect(formatRelativeTime('2026-05-27 12:00:00')).toBe('30s ago')
  })
})
