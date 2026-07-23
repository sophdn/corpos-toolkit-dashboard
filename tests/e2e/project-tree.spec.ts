import { expect, test } from '@playwright/test'

// File-level skip: this spec exercises a page that has been moved to
// src/pages/_dormant/. The page is no longer routed and the assertions
// fail with 404 / locator-not-found. Restore the page (move out of
// _dormant/ + register a route) before re-enabling. Filed as bug
// dashboard-playwright-tests-not-in-ci-quietly-rotted-since-cd5d3cf
// and its T16 follow-up.
test.skip()

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_STATS = {
  total_files: 1247,
  total_directories: 89,
  breakdown: {
    'process-docs/': { files: 43, subdirs: 7 },
    'tools/': { files: 3, subdirs: 14 },
  },
}

const ROOT_TREE = {
  found: true,
  path: '',
  depth: 2,
  tree: {
    name: 'seed-packet',
    type: 'dir',
    children: [
      {
        name: 'process-docs',
        type: 'dir',
        children: [
          { name: 'PROTOCOLS.md', type: 'file' },
          { name: 'glyph-model', type: 'dir' },
        ],
      },
      {
        name: 'workflows',
        type: 'dir',
        children: [
          { name: 'definitions', type: 'dir' },
        ],
      },
      { name: 'CLAUDE.md', type: 'file' },
      { name: 'LOCI.md', type: 'file' },
    ],
  },
  stats: MOCK_STATS,
}

const PROCESS_DOCS_TREE = {
  found: true,
  path: 'process-docs',
  depth: 2,
  tree: {
    name: 'process-docs',
    type: 'dir',
    children: [
      { name: 'glyph-model', type: 'dir', children: [] },
      { name: 'mcp-servers-migration', type: 'dir', children: [] },
      { name: 'PROTOCOLS.md', type: 'file' },
      { name: 'STUDIES.md', type: 'file' },
    ],
  },
}

const NOT_FOUND = {
  found: false,
  path: 'nonexistent-xyzzy',
  note: 'Path not found in project. Call project_tree with an empty path to browse from root.',
}

function mockTree(page: import('@playwright/test').Page, response: object, path?: string) {
  return page.route(
    url => {
      if (!url.href.includes('/project/tree') || url.href.includes(':5180')) return false
      if (path !== undefined) {
        const urlPath = new URL(url.href).searchParams.get('path') ?? ''
        return urlPath === path
      }
      return true
    },
    route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(response),
      }),
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('page loads and shows root tree', async ({ page }) => {
  await mockTree(page, ROOT_TREE)
  await page.goto('/project/tree')

  await expect(page.getByRole('heading', { name: 'Project Tree' })).toBeVisible()
  await expect(page.locator('[data-testid="tree-dir"]').first()).toBeVisible()
})

test('directories and files are separated into sections', async ({ page }) => {
  await mockTree(page, ROOT_TREE)
  await page.goto('/project/tree')

  const dirs = page.locator('[data-testid="tree-dir"]')
  const files = page.locator('[data-testid="tree-file"]')

  await expect(dirs).toHaveCount(2)
  await expect(files).toHaveCount(2)
  await expect(dirs.first()).toContainText('process-docs')
  await expect(files.first()).toContainText('CLAUDE.md')
})

test('clicking a directory navigates into it', async ({ page }) => {
  await mockTree(page, ROOT_TREE, '')
  await mockTree(page, PROCESS_DOCS_TREE, 'process-docs')
  await page.goto('/project/tree')

  await page.locator('[data-testid="tree-dir"]').filter({ hasText: 'process-docs' }).click()

  await expect(page.locator('[data-testid="tree-dir"]').filter({ hasText: 'glyph-model' })).toBeVisible()
  await expect(page.locator('[data-testid="tree-file"]').filter({ hasText: 'PROTOCOLS.md' })).toBeVisible()
})

test('breadcrumb shows current path after navigation', async ({ page }) => {
  await mockTree(page, ROOT_TREE, '')
  await mockTree(page, PROCESS_DOCS_TREE, 'process-docs')
  await page.goto('/project/tree')

  await page.locator('[data-testid="tree-dir"]').filter({ hasText: 'process-docs' }).click()

  await expect(page.getByText('process-docs', { exact: true }).last()).toBeVisible()
})

test('breadcrumb root segment navigates back to root', async ({ page }) => {
  await mockTree(page, ROOT_TREE, '')
  await mockTree(page, PROCESS_DOCS_TREE, 'process-docs')
  await page.goto('/project/tree')

  await page.locator('[data-testid="tree-dir"]').filter({ hasText: 'process-docs' }).click()
  await expect(page.locator('[data-testid="tree-dir"]').filter({ hasText: 'glyph-model' })).toBeVisible()

  await page.getByRole('button', { name: 'root' }).click()

  await expect(page.locator('[data-testid="tree-dir"]').filter({ hasText: 'process-docs' })).toBeVisible()
})

test('not-found path shows note message', async ({ page }) => {
  await mockTree(page, NOT_FOUND)
  await page.goto('/project/tree')

  await expect(page.getByText('Path not found')).toBeVisible()
})

test('sidebar shows Project Tree nav link', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Project Tree' })).toBeVisible()
})

test('Full Project Stats card appears with file and directory counts', async ({ page }) => {
  // Stats now come from the /project/tree response directly.
  await mockTree(page, ROOT_TREE)
  await page.goto('/project/tree')

  const card = page.getByTestId('project-stats-card')
  await expect(card).toBeVisible()
  await expect(card).toContainText('Full Project Stats')
  await expect(card).toContainText('1,247')
  await expect(card).toContainText('files')
  await expect(card).toContainText('89')
  await expect(card).toContainText('directories')

  // Breakdown rows for both entries in MOCK_STATS.breakdown.
  const rows = card.locator('[data-testid="breakdown-row"]')
  await expect(rows).toHaveCount(2)
  await expect(rows.first()).toContainText('process-docs/')
})

test('server unavailable shows error state', async ({ page }) => {
  await page.route(
    url => url.href.includes('/project/tree') && !url.href.includes(':5180'),
    route => route.fulfill({ status: 503, body: 'project-root not configured' }),
  )
  await page.goto('/project/tree')

  await expect(page.locator('[role="alert"]')).toBeVisible()
})
