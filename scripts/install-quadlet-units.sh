#!/usr/bin/env bash
# Install the toolkit-dashboard Quadlet unit into the systemd-user generator dir
# and reload, so `systemctl --user start toolkit-dashboard` works.
#
# Idempotent. Run once after cloning + building the image:
#   scripts/build-image.sh && scripts/install-quadlet-units.sh
#   systemctl --user start toolkit-dashboard
#
# Note: the unit joins corpos.network, which is the SHARED network defined by
# the toolkit repo's deploy/quadlet/corpos.network. That unit is installed once
# (by the toolkit repo's installer); this script does not redefine it.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/containers/systemd"
SRC="$ROOT/deploy/quadlet/toolkit-dashboard.container"

[ -f "$SRC" ] || { echo "ERROR: $SRC not found" >&2; exit 1; }

mkdir -p "$UNIT_DIR"
install -m 0644 "$SRC" "$UNIT_DIR/toolkit-dashboard.container"
echo "installed $UNIT_DIR/toolkit-dashboard.container"

if ! podman network exists corpos-net 2>/dev/null; then
  echo "WARNING: the 'corpos-net' network does not exist yet." >&2
  echo "         Install + start it from the toolkit repo (deploy/quadlet/corpos.network)" >&2
  echo "         before starting this unit, or the container will fail to attach." >&2
fi

systemctl --user daemon-reload
echo
echo "Installed. Start with:  systemctl --user start toolkit-dashboard"
echo "It serves on http://localhost:8082 (PublishPort 8082:8080)."
echo "Boot-start without a login session needs lingering (once):"
echo "  sudo loginctl enable-linger \"$USER\""
