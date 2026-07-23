#!/usr/bin/env bash
# scripts/precommit.sh — unified pre-commit gate for sophdn/frontend.
#
# Single entry point that an agent or developer invokes before committing.
# Mirrors the shape of the sibling repos' gates (toolkit's
# scripts/precommit.sh, seed-packet's) so an agent moving between
# workspaces doesn't have to remember multiple invocation conventions.
#
# This is the frontend (React/Vite dashboard) gate. It was split out of
# the mcp-servers monorepo (chain auto-startup-dev-services T3): the
# CSS-token-drift and tsc stages used to live in the monorepo's Go gate;
# they move here with the dashboard. The toolkit↔frontend boundary is the
# HTTP API contract (VITE_API_BASE_URL → the toolkit's observe surface),
# NOT a shared source tree. The ONE controlled exception is stage 0: the
# generated API-type contract (src/api/types.gen.ts), which is a tygo
# mirror of the toolkit's Go response structs. That codegen + its freshness
# check also belong with the dashboard post-split, and live here — but they
# read the toolkit's Go source from a sibling clone, so the check
# skips-with-warning when Go or that clone is absent (CI / standalone). See
# scripts/gen-types.sh and bug
# gots-types-contract-gate-has-no-home-after-dashboard-split.
#
# Stages run, in order, fail-fast on first non-zero:
#   0. API-type freshness src/api/types.gen.ts must match a fresh tygo
#                        regeneration from the toolkit's Go structs (or skip
#                        if the toolkit source / Go isn't reachable).
#   1. CSS-token drift   every var(--*) reference under src/ must resolve
#                        to a token defined in src/theme/tokens.css (or the
#                        drift allow-list). Catches theme breakage that
#                        falls through to the var() fallback silently.
#   2. eslint            `npm run lint` (flat config, eslint.config.cjs):
#                        @eslint/js recommended + typescript-eslint + react
#                        + react-hooks. Fails on ERRORS only; warnings are
#                        advisory ratchet candidates.
#   3. tsc --noEmit      type-check the app (tsconfig.app.json → src/) and
#                        the config files (tsconfig.node.json → vite/
#                        playwright config). strict + noUnusedLocals.
#   4. vitest run        the hermetic structural test layer (jsdom). The
#                        Playwright e2e journey suite is NOT gated here —
#                        it needs a live toolkit backend; run it
#                        separately with `npm run test:e2e` against a
#                        reachable VITE_API_BASE_URL.
#
# Invoked from two places: the local .git/hooks/pre-commit symlink (wired
# by scripts/install-hooks.sh) and .gitea/workflows/ci.yaml, which runs
# this same script on a clean checkout so CI enforcement can never drift
# from the local gate. CI runs `npm ci` first; locally you need
# node_modules present (the gate fails loudly if it isn't).

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

# Dependencies must be installed — this is a JS gate, not skippable like
# the monorepo's optional dashboard stages were. Fail loudly with the fix
# rather than silently passing a gate that ran nothing.
if [ ! -d node_modules ]; then
  echo "ERROR: node_modules/ missing — run 'npm ci' before committing." >&2
  exit 1
fi

# ── 0. API-type contract freshness (Go→TS) ───────────────────────────────────
# src/api/types.gen.ts is the generated TS mirror of the toolkit's Go
# observe-HTTP response structs (the contract's single source of truth).
# Regenerate from a sibling toolkit clone and fail if the committed copy
# drifted — the post-split home of the monorepo's tygo gate (bug
# gots-types-contract-gate-has-no-home-after-dashboard-split). The check
# needs Go + the toolkit source; when absent (CI on a clean checkout, a
# standalone frontend clone) it SKIPS with a warning rather than failing, so
# this is best-effort enforcement at the dev-machine commit boundary.
# CI-side enforcement that checks out both repos is deferred to
# finish-sophdn-repo-split T8 (enforce-single-canonical-source).
echo "[precommit.sh] API-type contract freshness (src/api/types.gen.ts)"
_types_rc=0
scripts/gen-types.sh --check || _types_rc=$?
case "$_types_rc" in
  0) : ;;          # up to date — gen-types.sh printed the confirmation
  2) exit 1 ;;     # real drift — gen-types.sh printed the diff + fix command
  3) echo "[precommit.sh] ⚠  types.gen.ts freshness SKIPPED — Go toolchain unreachable (dev-machine-only check; see scripts/gen-types.sh)." ;;
  4) echo "[precommit.sh] ✗ types.gen.ts freshness could NOT be verified — toolkit Go source unreachable. Set TOOLKIT_GO_DIR to the sibling corpos-toolkit/go clone." >&2; exit 1 ;;
  *) echo "[precommit.sh] ⚠  types.gen.ts freshness check errored (rc=$_types_rc) — not blocking." ;;
esac

# ── 1. CSS-token drift ───────────────────────────────────────────────────────
# Every var(--*) reference under src/ must resolve to a token defined in
# src/theme/tokens.css. Undefined references silently fall through to the
# var() fallback (or the property's initial value), so the rule can't
# respond to theme changes. Class-(b) undefined-from-the-start tokens are
# tolerated via src/theme/tokens-drift-allowlist.txt (they need
# design-system decisions, not a mechanical fix). New drift fails the gate.
if [ -f src/theme/tokens.css ]; then
  echo "[precommit.sh] CSS token drift (var(--*) → src/theme/tokens.css)"
  _drift=$(comm -23 \
    <(grep -rhoE 'var\(--[a-z-]+[,)]' src --include='*.css' \
        | sed -E 's/var\(//; s/[,)]$//' | sort -u) \
    <(cat src/theme/tokens.css \
         src/theme/tokens-drift-allowlist.txt 2>/dev/null \
        | grep -oE -- '--[a-z-]+' | sort -u))
  if [ -n "$_drift" ]; then
    echo "ERROR: var() references to undefined design tokens:"
    echo "$_drift" | sed 's/^/  /'
    echo "Define each token in src/theme/tokens.css for both light and dark"
    echo "themes, or replace the reference with an existing token. Fallback"
    echo "values silently mask theme breakage — don't add one as a"
    echo "workaround. If the drift is an existing class-(b) token, add it to"
    echo "src/theme/tokens-drift-allowlist.txt with a TODO naming the design"
    echo "decision that's still pending."
    exit 1
  fi
fi

# ── 2. eslint (flat config) ──────────────────────────────────────────────────
# `npm run lint` = `eslint .` over the flat config (eslint.config.cjs):
# @eslint/js recommended + typescript-eslint + react + react-hooks. eslint
# exits non-zero on ERRORS only — warnings (prefer-template, dot-notation,
# exhaustive-deps, …) are advisory ratchet candidates and don't block.
echo "[precommit.sh] npm run lint (eslint)"
npm run lint --silent

# ── 3. tsc --noEmit (app + config projects) ──────────────────────────────────
# tsconfig.app.json type-checks src/ (strict, noUnusedLocals/Parameters,
# noFallthroughCasesInSwitch); tsconfig.node.json type-checks the build/
# test config files (vite.config.ts, playwright.config.ts). Both carry
# noEmit:true, so this is a pure type gate — no dist/ emission. Run per
# project (not `tsc -b`) because the projects aren't `composite`.
echo "[precommit.sh] tsc --noEmit (tsconfig.app.json — src/)"
npx --no-install tsc -p tsconfig.app.json --noEmit
echo "[precommit.sh] tsc --noEmit (tsconfig.node.json — vite/playwright config)"
npx --no-install tsc -p tsconfig.node.json --noEmit

# ── 4. vitest run + coverage (structural test layer) ─────────────────────────
# The hermetic unit/integration suite (jsdom; tests/e2e is excluded in
# vite.config.ts's test block). Playwright journeys are intentionally NOT
# here — they require a reachable toolkit backend and live outside the
# blocking gate. Runs WITH coverage: vitest enforces the ratchet thresholds
# in vite.config.ts's test.coverage.thresholds and exits non-zero if any
# metric regresses below its floor, so a coverage drop FAILS the commit.
# STOPGAP — to be superseded by the corpos-gate-testing-module chain.
echo "[precommit.sh] npm run coverage (vitest run --coverage)"
npm run coverage --silent

echo "[precommit.sh] all stages passed."
