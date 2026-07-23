import type { ProjectTreeResponse } from '../lib/projectTree'

/**
 * Stub. observe-http has no `/project/tree` endpoint. The ProjectTree
 * page is dropped from the router in T16. Source kept on disk for
 * revival.
 */
export function getProjectTree(
  _path: string,
  _depth: number,
  _signal?: AbortSignal,
): Promise<ProjectTreeResponse> {
  return Promise.resolve({
    found: false,
    root: '',
    nodes: [],
    stats: { chains_total: 0, tasks_total: 0, bugs_open: 0 },
  } as unknown as ProjectTreeResponse)
}
