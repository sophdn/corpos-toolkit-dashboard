import type { Page, Route } from '@playwright/test'

/**
 * Host-scoped wrapper around `page.route()`. Pins the matched URL to
 * the observe-http API host so a path that also exists as an SPA
 * route under the Vite dev server (port 5180) — `/roadmap`,
 * `/bugs`, `/projects`, ... — does not get fulfilled with API JSON
 * instead of the bundle's index.html. See bug 992.
 *
 * The host is read from `PLAYWRIGHT_API_HOST` at module load with a
 * default of `http://localhost:3001`. The equivalence-harness sets
 * this var when booting an isolated toolkit-server on a different
 * port (e.g. :3099) so the mocks still scope correctly. Closes
 * bug `playwright-specs-hardcode-localhost-3000-which-blocks-
 * isolated-daemon-runs`.
 *
 * Pass either:
 *   - a string starting with `/` (treated as a path; query strings are
 *     accepted automatically), or
 *   - a `RegExp` whose source begins with `/` and is matched only after
 *     the API host.
 *
 * Example:
 *   apiRoute(page, '/roadmap', r => r.fulfill({ ... }))
 *   apiRoute(page, /\/tasks(\?.*)?$/, async r => { ... })
 */

// Read once at module load. process.env is stable across the test
// run; re-reading per call would let stray mutations confuse the
// mock scoping mid-test.
const API_HOST_STR =
  (typeof process !== 'undefined' && process.env && process.env.PLAYWRIGHT_API_HOST) ||
  'http://localhost:3001'

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export const API_HOST = new RegExp(`^${escapeRegex(API_HOST_STR)}`)

/**
 * apiUrlPattern composes the env-configured API host with a path
 * pattern (string or RegExp) and returns the full RegExp suitable
 * for `page.route()` or `page.waitForResponse()`. Use this in spec
 * files instead of hardcoding `localhost:3001` so the equivalence-
 * harness can intercept against an isolated daemon.
 *
 * Example:
 *   await page.route(apiUrlPattern(/\/chains(\?|$)/), handler)
 *   const resp = await page.waitForResponse(apiUrlPattern(/\/chains\?/))
 */
export function apiUrlPattern(pathPattern: string | RegExp): RegExp {
  if (typeof pathPattern === 'string') {
    if (!pathPattern.startsWith('/')) {
      throw new Error(`apiUrlPattern: path must start with '/', got '${pathPattern}'`)
    }
    return new RegExp(`${API_HOST.source}${escapeRegex(pathPattern)}`)
  }
  return new RegExp(`${API_HOST.source}${pathPattern.source}`)
}

export function apiRoute(
  page: Page,
  path: string | RegExp,
  handler: (route: Route) => void | Promise<void>,
): Promise<void> {
  let scoped: RegExp
  if (typeof path === 'string') {
    if (!path.startsWith('/')) {
      throw new Error(`apiRoute: path must start with '/', got '${path}'`)
    }
    const escaped = escapeRegex(path)
    scoped = new RegExp(`${API_HOST.source}${escaped}(\\?.*)?$`)
  } else {
    scoped = new RegExp(`${API_HOST.source}${path.source}`)
  }
  return page.route(scoped, handler)
}
