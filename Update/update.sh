#!/usr/bin/env bash
set -euo pipefail

# --- Konfiguration ---
BRANCH="${BRANCH:-main}"
REMOTE="${REMOTE:-origin}"
COMPOSE_CMD="${COMPOSE_CMD:-docker compose}"

# Repo-Root automatisch finden (Update/..)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_DIR"

echo "[kix18] Repo: $REPO_DIR"
echo "[kix18] Remote/Branch: $REMOTE/$BRANCH"

# Sicherstellen, dass es ein Git-Repo ist
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "[kix18] ERROR: Kein Git-Repository: $REPO_DIR"
  exit 1
fi

# Updates abholen
git fetch "$REMOTE" "$BRANCH"

LOCAL="$(git rev-parse HEAD)"
REMOTE_HASH="$(git rev-parse "$REMOTE/$BRANCH")"

if [ "$LOCAL" = "$REMOTE_HASH" ]; then
  echo "[kix18] Kein Update verfügbar."
  exit 0
fi

echo "[kix18] Update verfügbar:"
echo "        local : $LOCAL"
echo "        remote: $REMOTE_HASH"

# Lokale Änderungen verwerfen (wichtig bei force-push / divergenten Ständen)
git reset --hard "$REMOTE/$BRANCH"



# Docker Deploy 
echo "[kix18] Baue & starte Container neu..."
$COMPOSE_CMD up -d --build

echo "[kix18] Fertig. Aktueller Stand: $(git rev-parse --short HEAD)"
