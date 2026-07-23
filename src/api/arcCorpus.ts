import { get } from '../lib/http'
import type { ArcCorpusStatsResponse } from './types.gen'

/**
 * GET /telemetry/snapshot-corpus/stats — arc-close snapshot-corpus
 * readiness telemetry (arcreview_snapshot_corpus). Takes no filter params:
 * the corpus is session/event scoped and cross-project by construction.
 */
export async function getSnapshotCorpusStats(
  signal?: AbortSignal,
): Promise<ArcCorpusStatsResponse> {
  return get<ArcCorpusStatsResponse>('/telemetry/snapshot-corpus/stats', signal)
}
