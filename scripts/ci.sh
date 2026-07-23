#!/usr/bin/env bash
# apps/dashboard/scripts/ci.sh — single source of truth for the JS CI sequence.
#
# Mirrors scripts/precommit.sh on the Rust side: CI and any local gate
# both invoke this script so future steps land in one place and the two
# can never drift apart.
#
# Stages (fail-fast):
#   1. npm run build  — tsc -b + vite build; catches type errors in all files
#   2. npm run coverage — vitest run --coverage; unit/integration failures +
#                       the ratchet coverage thresholds (vite.config.ts)
#   3. npm run test:e2e — Playwright; catches user-journey regressions
#
# Pre-conditions (caller must arrange):
#   - npm ci already run (dependencies installed)
#   - Playwright browsers installed (npx playwright install --with-deps)
#
# Run locally from repo root:
#   cd apps/dashboard && bash scripts/ci.sh

set -euo pipefail

# ── 1. build (tsc + vite) ────────────────────────────────────────────────────
echo "[dashboard/ci.sh] npm run build"
npm run build

# ── 2. unit tests + coverage (vitest) ────────────────────────────────────────
echo "[dashboard/ci.sh] npm run coverage"
npm run coverage

# ── 3. e2e tests (playwright) ────────────────────────────────────────────────
echo "[dashboard/ci.sh] npm run test:e2e"
npm run test:e2e

echo "[dashboard/ci.sh] all stages passed."
