import { useEffect, useRef, useState } from 'react'

/**
 * One span event arriving over the toolkit-server `/events/spans` SSE
 * stream. Mirrors the Go shape from `go/internal/obs/sink.go`:
 *
 *   type SpanEvent struct {
 *     Type, SpanID, ParentSpanID, TraceID, Name string
 *     StartedAt, Status, ErrorMsg string
 *     DurationMS int64
 *   }
 *
 * Two `type` variants are emitted: `span_open` (no DurationMS/Status)
 * and `span_close` (always with DurationMS, Status ∈ {"ok","error"}).
 * Consumers fold the stream into a tree keyed by `trace_id`; expanding
 * a trace shows its children sorted by `started_at`.
 */
export type SpanEvent = {
  type: 'span_open' | 'span_close'
  span_id: string
  parent_span_id?: string
  trace_id: string
  name: string
  started_at: string
  duration_ms?: number
  status?: 'ok' | 'error'
  error?: string
}

const BASE_URL =
  (import.meta.env['VITE_API_BASE_URL'] as string | undefined) ??
  'http://localhost:3001'

/**
 * Subscribe to the `/events/spans` SSE stream. Returns the most-recent
 * `bufferSize` events (default 200), newest first. The hook owns its
 * own EventSource — no shared bus, no ref counting — because the spans
 * panel is the only consumer today.
 *
 * On stream error (server restart, network blip), the browser's
 * EventSource auto-reconnects with exponential backoff. Consumers see
 * the events resume; older events may be missed on the gap (the bus
 * is non-persistent).
 */
export function useSpanStream(bufferSize = 200): SpanEvent[] {
  const [events, setEvents] = useState<SpanEvent[]>([])
  const sourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    const src = new EventSource(`${BASE_URL}/events/spans`)
    sourceRef.current = src
    src.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as SpanEvent
        setEvents((prev) => {
          const next = [data, ...prev]
          if (next.length > bufferSize) next.length = bufferSize
          return next
        })
      } catch {
        // Malformed event — ignore.
      }
    }
    src.onerror = () => {
      // EventSource auto-reconnects; nothing else to do.
    }
    return () => {
      src.close()
      sourceRef.current = null
    }
  }, [bufferSize])

  return events
}
