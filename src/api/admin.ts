import { get } from '../lib/http'

/** One row from the unified DB's `projects` table. */
export interface ProjectInfo {
  id: string
  name: string
  path: string
  created_at: string
}

/**
 * Best-effort probe for the registered projects. Returns an empty list
 * on any error — the picker degrades to showing only the All-Projects
 * option rather than blocking the UI.
 *
 * Bug 1430: emit a console.warn on non-abort failures so developer-side
 * breakage (missing route, dispatcher panic, malformed response) is
 * detectable when the user-facing UX degrades silently. AbortError on
 * unmount is normal and stays quiet.
 */
export async function listProjects(signal?: AbortSignal): Promise<ProjectInfo[]> {
  try {
    return await get<ProjectInfo[]>('/projects', signal)
  } catch (err) {
    if (!(err instanceof DOMException && err.name === 'AbortError')) {
      console.warn('[dashboard] listProjects(/projects) failed — picker will degrade to All-Projects only:', err)
    }
    return []
  }
}
