import type { ProjectStatsResponse } from './projectStats'

export interface TreeNode {
  name: string
  type: 'file' | 'dir'
  children?: TreeNode[]
}

export interface ProjectTreeResponse {
  found: boolean
  path: string
  depth?: number
  tree?: TreeNode
  note?: string
  /** Project-wide file and directory counts. Present when found=true. */
  stats?: ProjectStatsResponse
}
