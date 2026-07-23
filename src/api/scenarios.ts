import type { CorpusLayer, ScenariosResponse } from '../lib/scenarios'

/**
 * Stub. observe-http has no `/scenarios` endpoint. The Scenarios page
 * is dropped from the router in T16. Source kept on disk for revival.
 */
export function getScenarios(
  _params?: { layer?: CorpusLayer; tool?: string },
  _signal?: AbortSignal,
): Promise<ScenariosResponse> {
  return Promise.resolve({ scenarios: [] })
}
