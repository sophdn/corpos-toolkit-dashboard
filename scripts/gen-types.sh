#!/usr/bin/env bash
# scripts/gen-types.sh — regenerate src/api/types.gen.ts from the toolkit's
# Go observe-HTTP response structs via tygo.
#
# The toolkit↔frontend boundary is the HTTP API contract: the dashboard's TS
# adapters consume the toolkit's JSON response shapes. src/api/types.gen.ts
# is the GENERATED mirror of the Go structs that define those shapes (the
# single source of truth). This script — plus the freshness stage in
# scripts/precommit.sh — is the post-split home of the tygo codegen that
# used to live in the mcp-servers monorepo's Go gate. Closes the
# silent-drift gap (bug
# gots-types-contract-gate-has-no-home-after-dashboard-split): without it, a
# toolkit-side struct change would leave this file stale with nothing to
# catch it.
#
# tygo must run INSIDE the toolkit's Go module so the `toolkit/...` import
# path resolves. It reads from a SIBLING CLONE of the toolkit repo; override
# its location with TOOLKIT_GO_DIR (default: ../corpos-toolkit/go relative to
# this repo). tygo itself is fetched on demand via `go run` — no global
# install, and the toolkit module's go.mod is left untouched.
#
# Usage:
#   scripts/gen-types.sh            regenerate src/api/types.gen.ts in place
#   scripts/gen-types.sh --check    verify the committed file is up to date
#                                   (regenerate to a temp + diff; no write)
#
# Exit codes:
#   0  generated, or (--check) up to date
#   2  (--check only) drift: the committed file is stale — run without --check
#   3  preconditions unmet: no Go toolchain (or, in generate mode, the toolkit
#      source isn't reachable). Callers (the gate) treat this as a skip.
#   4  (--check only) toolkit Go source unreachable — the API-type freshness
#      contract cannot be verified. The gate treats this as a FAILURE, not a
#      skip (a silent skip let a stale types.gen.ts through CI).
set -euo pipefail

TYGO_VERSION="v0.2.21"   # matches the version the monorepo pinned as a go tool
MODE="${1:-generate}"

REPO_ROOT="$(git rev-parse --show-toplevel)"
TOOLKIT_GO_DIR="${TOOLKIT_GO_DIR:-$REPO_ROOT/../corpos-toolkit/go}"
OUT="$REPO_ROOT/src/api/types.gen.ts"
CONFIG="$REPO_ROOT/tygo.yaml"

skip() { echo "[gen-types] $*" >&2; exit 3; }

command -v go >/dev/null 2>&1 \
  || skip "go toolchain not found — tygo needs Go to read the toolkit structs."

# Toolkit source must be present to verify the contract. The default now points
# at the real sibling clone (../corpos-toolkit/go), so a missing dir during
# --check is a genuine gate failure — not a skip. Silently skipping (the old
# behavior, caused by a stale default path) let a drifted types.gen.ts through
# CI: bug dashboard-gen-types-default-toolkit-dir-wrong-silently-skips-gate.
if [ ! -d "$TOOLKIT_GO_DIR/internal/observehttp" ]; then
  msg="toolkit Go source not found at $TOOLKIT_GO_DIR/internal/observehttp (set TOOLKIT_GO_DIR to the sibling corpos-toolkit clone's go/ dir)."
  if [ "$MODE" = "--check" ]; then
    echo "[gen-types] $msg" >&2
    echo "[gen-types] --check cannot verify the API-type freshness contract without the toolkit source; failing (not skipping)." >&2
    exit 4
  fi
  skip "$msg"
fi

[ -f "$CONFIG" ] \
  || skip "tygo config missing: $CONFIG"

# Where tygo writes. In --check mode that's a throwaway temp we diff against
# the committed file; otherwise it's the real file.
tmpcfg="$(mktemp --suffix=.tygo.yaml)"
if [ "$MODE" = "--check" ]; then
  gen_out="$(mktemp --suffix=.types.gen.ts)"
else
  gen_out="$OUT"
fi
cleanup() { rm -f "$tmpcfg"; [ "$MODE" = "--check" ] && rm -f "$gen_out"; return 0; }
trap cleanup EXIT

# tygo has no output CLI flag; output_path is config-only + CWD-relative, so
# bake an absolute path into a temp copy of the config.
sed "s|__OUTPUT_PATH__|$gen_out|" "$CONFIG" > "$tmpcfg"

( cd "$TOOLKIT_GO_DIR" && go run "github.com/gzuidhof/tygo@$TYGO_VERSION" generate --config "$tmpcfg" ) >/dev/null

if [ "$MODE" = "--check" ]; then
  if ! diff -u "$OUT" "$gen_out" >/dev/null 2>&1; then
    echo "[gen-types] DRIFT: src/api/types.gen.ts is stale vs the toolkit's Go structs." >&2
    echo "[gen-types] Diff (committed → regenerated):" >&2
    diff -u "$OUT" "$gen_out" >&2 || true
    echo "[gen-types] Fix: scripts/gen-types.sh && git add src/api/types.gen.ts" >&2
    exit 2
  fi
  echo "[gen-types] src/api/types.gen.ts is up to date with the toolkit contract."
else
  echo "[gen-types] regenerated $OUT"
fi
