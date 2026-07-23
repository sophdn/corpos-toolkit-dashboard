import { useEffect, useRef } from 'react'
import type { ToolkitEvent, ToolkitEventKind } from '../lib/events'

const BASE_URL =
  (import.meta.env['VITE_API_BASE_URL'] as string | undefined) ?? 'http://localhost:3001'

type Listener = (event: ToolkitEvent) => void

class EventBus {
  private source: EventSource | null = null
  private listeners: Map<ToolkitEventKind, Set<Listener>> = new Map()
  private refCount = 0

  subscribe(kinds: ToolkitEventKind[], listener: Listener): () => void {
    for (const kind of kinds) {
      if (!this.listeners.has(kind)) this.listeners.set(kind, new Set())
      this.listeners.get(kind)!.add(listener)
    }
    this.refCount += 1
    if (this.refCount === 1) {
      this.connect()
    }
    return () => {
      for (const kind of kinds) {
        this.listeners.get(kind)?.delete(listener)
      }
      this.refCount -= 1
      if (this.refCount <= 0) {
        this.disconnect()
        this.refCount = 0
      }
    }
  }

  private connect(): void {
    if (this.source !== null) return
    try {
      const src = new EventSource(`${BASE_URL}/events`)
      this.source = src
      src.onmessage = ev => {
        try {
          const data = JSON.parse(ev.data) as ToolkitEvent
          const kind = data.event
          this.listeners.get(kind)?.forEach(l => l(data))
        } catch {
          // Malformed event — ignore.
        }
      }
      src.onerror = () => {
        // EventSource auto-reconnects with backoff; nothing else to do.
      }
    } catch {
      this.source = null
    }
  }

  private disconnect(): void {
    this.source?.close()
    this.source = null
  }
}

const bus = new EventBus()

/**
 * Subscribe to one or more event kinds. The handler is called once per
 * matching event. Tear-down on unmount is automatic.
 *
 * Pass `kinds` as a stable reference (`useMemo`-wrapped or a constant
 * outside the component) so the effect doesn't re-subscribe every
 * render. Most pages can use module-level `const KINDS = [...]`.
 */
export function useEventBus(
  kinds: ToolkitEventKind[],
  handler: (event: ToolkitEvent) => void,
): void {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    const unsubscribe = bus.subscribe(kinds, ev => handlerRef.current(ev))
    return unsubscribe
    // We intentionally don't depend on `kinds` re-reference; consumers
    // pass module-level constants. If `kinds` content changes, the
    // consumer can wrap in a key-based remount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

/** Convenience: re-fetch trigger. Returns a "tick" counter that
 * increments on every matching event. Pages put it in their fetch
 * effect's dep list to refetch on demand. */
import { useState } from 'react'
export function useEventTick(kinds: ToolkitEventKind[]): number {
  const [tick, setTick] = useState(0)
  useEventBus(kinds, () => setTick(t => t + 1))
  return tick
}
