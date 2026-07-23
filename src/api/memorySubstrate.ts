import { get } from '../lib/http'
import type { MemorySubstrateStats } from './types.gen'

/**
 * GET /knowledge/memory-substrate — telemetry for the vault-mediated
 * memory substrate (proj_memories + MemoryWritten events). No filter
 * params: the view is global (user-kind memories are cross-project and the
 * event / grounding signals are not cleanly per-project).
 */
export async function getMemorySubstrateStats(
  signal?: AbortSignal,
): Promise<MemorySubstrateStats> {
  return get<MemorySubstrateStats>('/knowledge/memory-substrate', signal)
}
