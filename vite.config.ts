import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// The frontend is its own repo (split from the mcp-servers monorepo, chain
// auto-startup-dev-services T3) and reaches the toolkit backend over its HTTP
// API. The monorepo-era daemon-staleness machinery (devGitShaPlugin, the
// /__app-git-sha + /__daemon-staleness dev middleware, the __APP_GIT_SHA__
// define) was removed with the StaleDaemonBanner: it compared the dashboard's
// git SHA against the toolkit daemon's SHA within ONE repo, which is
// meaningless now that the two repos have independent histories.

export default defineConfig({
  plugins: [react()],
  server: { port: 5180 },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['tests/e2e/**', 'src/pages/_dormant/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/__tests__/**',
        'src/api/types.gen.ts',
        'src/**/*.d.ts',
        'src/pages/_dormant/**',
        'tests/e2e/**',
        '**/*.config.*',
      ],
      // Ratchet baselines: each threshold is the CURRENT measured coverage
      // truncated down to a whole percent (measured 2026-07-12: statements
      // 69.29 / branches 58.43 / functions 69.70 / lines 72.81). They are a
      // floor to be raised over time as coverage improves — never lowered.
      // This is a STOPGAP enforcement; it will be superseded by the unified
      // tool from the corpos-gate-testing-module chain.
      thresholds: {
        statements: 69,
        branches: 58,
        functions: 69,
        lines: 72,
      },
    },
  },
})
