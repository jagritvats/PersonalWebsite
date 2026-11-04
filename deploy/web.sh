#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"
COMPOSE_ENV_FILE="$SCRIPT_DIR/.env.compose"
SERVICE=site

usage() {
  cat <<'EOF'
Usage: bash deploy/web.sh <command>

Commands:
  init       Create deploy/.env.compose from the example if missing
  config     Validate the resolved Docker Compose config
  deploy     Pull, start, health-check, then prune old images
  ps|status  Show service status
  logs       Follow site logs
  health     Check the in-container /healthz endpoint
  down       Stop and remove the site container
EOF
}

init() {
  if [[ ! -f "$COMPOSE_ENV_FILE" ]]; then
    cp "$SCRIPT_DIR/.env.compose.example" "$COMPOSE_ENV_FILE"
    echo "Created $COMPOSE_ENV_FILE"
  fi
}

compose() {
  init >/dev/null
  # SITE_IMAGE from the environment (set by CI) wins over .env.compose.
  docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

ensure_edge_network() {
  local net
  net="$(grep -E '^TRAEFIK_NETWORK=' "$COMPOSE_ENV_FILE" | tail -1 | cut -d= -f2- || true)"
  net="${TRAEFIK_NETWORK:-${net:-synapse-edge}}"
  docker network inspect "$net" >/dev/null 2>&1 || docker network create "$net" >/dev/null
}

health() {
  local i
  for i in $(seq 1 15); do
    if compose exec -T "$SERVICE" wget -qO- http://127.0.0.1/healthz >/dev/null 2>&1; then
      echo "$SERVICE healthy after ${i} attempt(s)"
      return 0
    fi
    sleep 2
  done
  echo "$SERVICE did not become healthy after ~30s" >&2
  compose logs --tail 40 "$SERVICE" >&2 || true
  return 1
}

case "${1:-}" in
  init)      init ;;
  config)    compose config ;;
  deploy)
    init
    ensure_edge_network
    compose pull
    compose up -d --remove-orphans
    health
    # Each deploy leaves the previous SHA-tagged image behind; keep recent
    # ones for rollback and drop the rest. Never fail a good deploy on this.
    docker image prune -af --filter "until=72h" >/dev/null 2>&1 || true
    ;;
  ps|status) compose ps ;;
  logs)      compose logs -f --tail=200 "$SERVICE" ;;
  health)    health ;;
  down)      compose down ;;
  -h|--help|help|"") usage ;;
  *) echo "Unknown command: $1" >&2; usage >&2; exit 1 ;;
esac
