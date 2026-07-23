export interface DirEntry {
  files: number
  subdirs: number
}

export interface ProjectStatsResponse {
  total_files: number
  total_directories: number
  breakdown: Record<string, DirEntry>
}
