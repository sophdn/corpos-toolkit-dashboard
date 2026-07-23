#!/usr/bin/env bash
# Build and smoke-test the toolkit-dashboard container image (rootless Podman).
#
# Builds the multi-stage deploy/toolkit-dashboard/Containerfile (context = repo
# root), tags the result, asserts the runtime stage runs as non-root, boots it
# on a throwaway port, and curls index.html as an end-to-end proof that the
# static bundle serves. Mirrors the toolkit repo's build-toolkit-image.sh.
#
# Usage:
#   scripts/build-image.sh                  build + smoke-test
#   scripts/build-image.sh --refresh-bases  pull floating base tags + print
#                                           digests to pin in the Containerfile
#
# Env:
#   TOOLKIT_DASHBOARD_IMAGE   image name (default toolkit-dashboard)
#   VITE_API_BASE_URL         baked API base (default = the Containerfile's ARG
#                             default, http://localhost:3001 = toolkit container)
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

IMAGE="${TOOLKIT_DASHBOARD_IMAGE:-toolkit-dashboard}"
CONTAINERFILE="deploy/toolkit-dashboard/Containerfile"
NODE_TAG="docker.io/library/node:22-bookworm"
NGINX_TAG="docker.io/nginxinc/nginx-unprivileged:1.27-alpine"

fail() { printf '[build-image] FAIL: %b\n' "$*" >&2; exit 1; }

command -v podman >/dev/null 2>&1 || fail "podman not found (chain mandates rootless podman)"

# --refresh-bases: re-pull the floating tags and print their current digests so
# they can be pasted back into the Containerfile's pinned FROM lines.
if [ "${1:-}" = "--refresh-bases" ]; then
  echo "[build-image] pulling floating base tags to read current digests…"
  podman pull "$NODE_TAG"  >/dev/null
  podman pull "$NGINX_TAG" >/dev/null
  echo "[build-image] pin these digests in $CONTAINERFILE:"
  podman image inspect "$NODE_TAG"  --format '  builder : {{index .RepoDigests 0}}'
  podman image inspect "$NGINX_TAG" --format '  runtime : {{index .RepoDigests 0}}'
  exit 0
fi

# Pass VITE_API_BASE_URL through only if the caller set it; otherwise the
# Containerfile's ARG default applies.
build_args=()
if [ -n "${VITE_API_BASE_URL:-}" ]; then
  build_args+=(--build-arg "VITE_API_BASE_URL=${VITE_API_BASE_URL}")
fi

echo "[build-image] building $IMAGE:dev from $CONTAINERFILE"
podman build "${build_args[@]}" -t "$IMAGE:dev" -f "$CONTAINERFILE" . || fail "podman build failed"

echo "[build-image] asserting the runtime image is non-root"
user="$(podman image inspect "$IMAGE:dev" --format '{{.Config.User}}')"
if [ -z "$user" ] || [ "$user" = "root" ] || [ "$user" = "0" ]; then
  fail "runtime image User is '$user' — expected a non-root user (nginx-unprivileged)"
fi
echo "[build-image]   runtime user = $user"

echo "[build-image] smoke-test: boot the container + curl index.html"
cid="$(podman run -d --rm -p 18080:8080 "$IMAGE:dev")" || fail "container failed to start"
cleanup() { podman rm -f "$cid" >/dev/null 2>&1 || true; }
trap cleanup EXIT

ok=0
for _ in $(seq 1 20); do
  if curl -fsS http://localhost:18080/ -o /tmp/dash-smoke.html 2>/dev/null; then ok=1; break; fi
  sleep 0.5
done
[ "$ok" = "1" ] || fail "could not curl the served SPA on :18080"
if ! grep -qiE '<div id="root"|<!doctype html' /tmp/dash-smoke.html; then
  fail "served page doesn't look like the SPA index.html"
fi
# History-fallback: a deep client route must also resolve to index.html.
if ! curl -fsS http://localhost:18080/telemetry -o /tmp/dash-smoke2.html 2>/dev/null \
   || ! grep -qiE '<div id="root"|<!doctype html' /tmp/dash-smoke2.html; then
  fail "SPA history-fallback (/telemetry → index.html) not working"
fi

echo "[build-image] OK — $IMAGE:dev builds, runs non-root, serves the SPA + history-fallback."
