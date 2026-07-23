# Frontend Conventions — dashboard

Reference for agents and humans working on the dashboard app. Every new
component, page, and test follows these rules. Deviations must be documented
inline with a reason.

---

## Folder structure

Every component and page is a folder, not a file.

```
src/
  components/
    layout/
      AppShell/
        index.tsx
        AppShell.module.css
        index.test.tsx
    shared/
      StatusBadge/
        index.tsx
        StatusBadge.module.css
        index.test.tsx
      Panel/
        index.tsx
        Panel.module.css
        index.test.tsx
  pages/
    ChainIndex/
      index.tsx
      ChainIndex.module.css
  lib/
    chainIndex.ts
    chainIndex.test.ts     ← co-located sibling, not in __tests__/
  hooks/
    useTheme.ts
    useTheme.test.tsx
  __tests__/
    setup.ts               ← vitest setup only; no test files here
    smoke.test.ts          ← harness sanity check only
  router/
    index.tsx
  theme/
    tokens.css
```

**Rules:**
- One folder per component or page. Never a bare `ComponentName.tsx` at the top level of `components/` or `pages/`.
- Tests live next to their source: `index.test.tsx` inside the component folder, `<module>.test.ts` as a sibling to `<module>.ts` in `lib/` and `hooks/`.
- `__tests__/` holds only `setup.ts` and the top-level smoke test — nothing else moves there.
- Shared components go in `components/shared/`. Layout components (AppShell, Sidebar) go in `components/layout/`.

---

## CSS modules

All styles use CSS modules (`.module.css`). No inline styles. No global class names.

```tsx
import styles from './ComponentName.module.css'

<div className={styles.container}>
  <span className={`${styles.badge} ${styles[`variant--${v}`]}`} />
</div>
```

**Rules:**
- One `.module.css` per component folder, named to match the folder: `StatusBadge.module.css`.
- BEM-style modifier classes use double-dash: `.status--active`, `.variant--chip`. Add a `/* stylelint-disable selector-class-pattern */` comment above modifier blocks.
- Never reach into another component's CSS module. Style your own component only.
- Dynamic class lookup uses nullish coalescing for safety: `styles[`status--${s}`] ?? ''`.

---

## Design tokens

Tokens live in `src/theme/tokens.css` and are CSS custom properties on `:root`.

### Primitive tokens
Raw values — spacing, radii, typography, base colours:
```css
--space-2: 8px;
--radius-md: 6px;
--color-success: #16a34a;
```

### Semantic status tokens
Map intent to primitives — use these in components, never the raw colour:

| Token | Meaning | Maps to |
|---|---|---|
| `--color-positive` / `--color-positive-subtle` | active, in-progress, improving | `--color-success` |
| `--color-neutral` / `--color-neutral-subtle` | pending, stable | `--color-accent` |
| `--color-negative` / `--color-negative-subtle` | closed, cancelled, blocked, degrading | `--color-danger` |

**Rule:** any status or state badge uses the semantic tokens, not the raw colour tokens. If the meaning of "positive" changes, one edit to `tokens.css` updates every badge.

---

## Shared components

### `StatusBadge`

```tsx
import { StatusBadge } from '../../components/shared/StatusBadge'

<StatusBadge status="active" variant="badge" />   // rounded rect
<StatusBadge status="in-progress" variant="chip" /> // pill
```

- `status` drives colour (via semantic tokens) and label (via `statusLabel()`).
- `variant="badge"` (default) → `border-radius: sm` for task rows.
- `variant="chip"` → `border-radius: full` (pill) for chain list progress.
- Always renders `data-testid="status-badge"`, `data-status`, `data-variant` for tests.
- Add new statuses to `statusLabel()` in `lib/chainIndex.ts` and `.status--<name>` in `StatusBadge.module.css`.

### `Panel`

```tsx
import { Panel } from '../../components/shared/Panel'

<Panel header={<span>Title</span>}>
  <SomeContent />
</Panel>
```

- Provides the shared panel shell: border, background, `max-height: 600px`, sticky header.
- `header` slot accepts any ReactNode — title text, controls, search input, toggles.
- Renders `data-testid="panel"` and `data-testid="panel-header"` for tests.
- The three columns in the task index all use Panel — do not duplicate the shell CSS.

---

## TypeScript

- Interfaces (not type aliases) for all API response shapes and component props.
- Response types live in `lib/` next to the fetch logic: `ChainStateResponse` in `lib/chainIndex.ts`.
- Pure logic functions (sort comparators, bucket classifiers, formatters) live in `lib/` and are exported for direct unit testing — keep them out of component files.
- All component props are typed inline in the same file; no separate `types.ts` per component.

---

## Data fetching

The standard pattern for a component that fetches on mount:

```tsx
const [data, setData] = useState<T | null>(null)
const [loading, setLoading] = useState(true)
const [error, setError] = useState<string | null>(null)
const abortRef = useRef<AbortController | null>(null)

useEffect(() => {
  abortRef.current?.abort()
  const ctrl = new AbortController()
  abortRef.current = ctrl

  setLoading(true)
  setError(null)

  get<T>('/some/endpoint', ctrl.signal)
    .then(data => { setData(data); setLoading(false) })
    .catch((err: Error) => {
      if (err.name !== 'AbortError') { setError(err.message); setLoading(false) }
    })

  return () => ctrl.abort()
}, [dependency])
```

**Rules:**
- Always cancel in-flight requests on unmount and on re-fetch (the `AbortController` pattern above).
- Never swallow `AbortError` — check `err.name !== 'AbortError'` before setting error state.
- Loading, error, and data are three separate state variables — never a single `status` enum.
- Data-up discipline: no frontend page or route exists until the backend endpoint returning real data is live. No placeholder routes, no hardcoded dummy values in production code.

---

## Routing

Routes are defined in `src/router/index.tsx` using `createBrowserRouter`.

```tsx
import { createBrowserRouter, redirect } from 'react-router-dom'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, loader: () => redirect('/tasks/chains') },
      { path: 'tasks/chains', element: <ChainIndexPage /> },
    ],
  },
])
```

**Rules:**
- Default redirects use `loader: () => redirect('/path')`, not `<Navigate>`. The loader fires at the routing layer before any component renders.
- Every meaningful page has its own named route. No catch-all `*` routes.
- The sidebar `<NavLink>` must match the route path exactly.

### Dormant pages

Pages whose backing endpoints aren't yet served are kept on disk for revival but moved under `src/pages/_dormant/`. That directory is excluded from `tsconfig.app.json` and from vitest's `test.include`, so api-shape changes elsewhere don't have to be propagated through the dormant code to keep the build green.

**Reviving a dormant page:** `git mv src/pages/_dormant/<Name> src/pages/<Name>`, fix any stale api imports, register the route in `src/router/index.tsx`, add the sidebar `<NavLink>`. The tsconfig exclude does not need to change — only files under `_dormant/` are skipped.

**Retiring a page (moving it dormant):** drop the route + sidebar entry, then `git mv src/pages/<Name> src/pages/_dormant/<Name>`. Do not stub api functions to keep dormant code building — the exclude does that for free.

---

## Testing

Two test layers: unit (Vitest) and journey (Playwright).

### Unit tests — Vitest

- Co-located: `index.test.tsx` inside the component folder, `<module>.test.ts` next to its lib file.
- Use `@testing-library/jest-dom` matchers (`toHaveAttribute`, `toBeInTheDocument`, `toHaveTextContent`, `toContainElement`). Never assert on raw `.textContent` or `.toBeDefined()`.
- Find elements by `data-testid`, not by text content or CSS class. Text is fragile; testids are stable.
- Every component that has a test must expose at least one `data-testid` on its root or meaningful element.

```tsx
// preferred
expect(screen.getByTestId('status-badge')).toHaveAttribute('data-status', 'active')

// avoid
expect(screen.getByText('Active')).toBeDefined()
```

- Pure logic (sort, filter, bucket, format) is tested directly without rendering — import the function, call it, assert the result.
- `__tests__/setup.ts` imports `@testing-library/jest-dom` once and extends `expect` globally.

### Journey tests — Playwright

- Live in `tests/e2e/`.
- One spec file per page: `chain-index.spec.ts`, `tool-health.spec.ts`.
- Mock API endpoints via the `apiRoute(page, path, handler)` helper in `tests/e2e/lib/api-route.ts`. It pins the match to the observe-http API host (port 3000), so a path that also exists as an SPA route under Vite (port 5180) — `/roadmap`, `/bugs`, `/projects`, ... — does not get fulfilled with API JSON instead of the bundle's index.html.

  ```ts
  import { apiRoute } from './lib/api-route'

  await apiRoute(page, '/roadmap', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ROADMAP) }))
  await apiRoute(page, /\/tasks(\?.*)?$/, async r => { /* ... */ })
  ```

  Do **not** call `page.route()` directly for observe-http endpoints — an unscoped regex that happens to match an SPA route silently breaks every selector with a generic 'element not found' (the page snapshot will show JSON as raw text).

- Each test covers exactly one user journey. Name tests as the journey: `'4: pending chains appear when Pending filter is selected'`.
- Use `data-testid` selectors in Playwright too: `page.getByTestId('chain-status-filter')`.
- Never hardcode expected call counts for network requests — capture a baseline (`const n = callCount`) and assert relative to it (`expect.poll(() => callCount).toBe(n + 1)`).

---

## `data-testid` conventions

| Element | `data-testid` |
|---|---|
| Theme toggle button | `theme-toggle` |
| Panel container | `panel` |
| Panel header area | `panel-header` |
| Status/progress badge | `status-badge` |
| Chain sort select | `chain-sort-select` |
| Chain status filter | `chain-status-filter` |
| Chain list item | `chain-item` |
| Chain search input | `chain-search` |
| Chain count header | `chain-count` |
| Task row | `task-row` |
| Right-panel toggle (task) | `right-panel-toggle-task` |
| Right-panel toggle (chain) | `right-panel-toggle-chain` |
| Chain task count strip | `chain-task-counts` |
| Chain meta strip | `chain-meta-strip` |

Add new testids to this table when introducing new interactive or assertable elements.
