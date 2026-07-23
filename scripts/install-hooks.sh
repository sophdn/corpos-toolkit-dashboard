#!/usr/bin/env bash
# scripts/install-hooks.sh — one-time post-clone setup.
#
# Installs this repo's git hooks as symlinks into .git/hooks/:
#   pre-commit → .git-hooks/pre-commit   (the precommit gate:
#                CSS-token-drift / tsc --noEmit / vitest; blocks failing
#                commits)
#
# Unlike the toolkit repo, the frontend has no built daemon to rebuild or
# restart, so there is NO post-commit / post-merge advisor — just the gate.
#
# Idempotent: re-running relinks the hook if its symlink is missing or
# stale. Run once from the repo root:
#   bash scripts/install-hooks.sh
set -euo pipefail
REPO_ROOT="$(git rev-parse --show-toplevel)"

# hook-name → symlink target (relative to REPO_ROOT)
declare -A HOOKS=(
    [pre-commit]=".git-hooks/pre-commit"
)

for hook in "${!HOOKS[@]}"; do
    src="$REPO_ROOT/${HOOKS[$hook]}"
    dst="$REPO_ROOT/.git/hooks/$hook"
    if [[ ! -e "$src" ]]; then
        echo "WARN: hook source missing, skipping $hook: $src" >&2
        continue
    fi
    chmod +x "$src"
    if [[ -L "$dst" && "$(readlink "$dst")" == "$src" ]]; then
        echo "$hook hook already installed."
        continue
    fi
    ln -sf "$src" "$dst"
    echo "$hook hook installed: $dst -> $src"
done
