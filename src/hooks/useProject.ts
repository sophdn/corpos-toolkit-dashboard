import { useState } from 'react'

/** Sentinel value the picker uses to mean "all projects" — empty string. */
export const ALL_PROJECTS = ''

/**
 * Page-scoped project filter state. Each call site gets its own React
 * state, defaulting to ALL_PROJECTS. Previously this was backed by
 * localStorage with cross-hook sync, which caused a Roadmap pick to
 * silently filter chains/bugs/inference too. Pages that want a picker
 * pair this with a controlled <ProjectPicker /> and pass the same
 * [value, setValue] pair.
 */
export function useProject(): [string, (next: string) => void] {
  return useState<string>(ALL_PROJECTS)
}

/**
 * Append a `project=...` query param when `project` is set. Used by
 * api functions to thread the filter through. Returns the original
 * path unchanged when `project` is the all-projects sentinel.
 */
export function withProjectQuery(path: string, project: string | undefined): string {
  if (!project) return path
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}project=${encodeURIComponent(project)}`
}
