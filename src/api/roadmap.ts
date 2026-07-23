import { get } from '../lib/http'

export interface RoadmapEntry {
  position: number
  project_id: string
  ref_kind: 'chain' | 'task'
  ref_slug: string
  chain_slug: string | null
  note: string | null
  status: string | null
  updated_at: string | null
}

export interface UnplacedRef {
  slug: string
  project_id: string
  created_at: string
  /// Set for task entries (the chain slug they belong to); null for
  /// chain entries themselves. Drives the deep-link to /tasks/chains.
  chain_slug: string | null
}

export interface RoadmapDiff {
  chains: UnplacedRef[]
  tasks: UnplacedRef[]
}

export async function listRoadmap(signal?: AbortSignal): Promise<RoadmapEntry[]> {
  return get<RoadmapEntry[]>('/roadmap', signal)
}

export async function getRoadmapDiff(signal?: AbortSignal): Promise<RoadmapDiff> {
  return get<RoadmapDiff>('/roadmap/diff', signal)
}
