#!/usr/bin/env bash
# Deploy-Skript fuer FaBu. Auf dem DEV-RECHNER ausfuehren (nicht auf dem
# Server), aus dem Repo-Root:
#   ./infra/scripts/deploy.sh
#
# Kopiert den aktuellen Commit (HEAD) per `git archive` + `tar` ueber SSH nach
# /opt/fabu, baut dort die drei Images und startet die Container neu.
#
# Bewusst *kein* `git pull` auf dem Server — anders als das alte
# deploy-prod.sh, das dafuer einen Git-Checkout samt Deploy-Key auf dem VPS
# brauchte und bei jedem lokalen Dateimodus-Unterschied in einen
# `git reset --hard` lief. Der git-archive-Weg braucht nur den SSH-Zugang,
# den das Deployen ohnehin verlangt, und es liegt kein Repo auf dem Server,
# das aus dem Tritt kommen kann.
#
# Es werden ausschliesslich *getrackte* Dateien von HEAD uebertragen.
# .env.production auf dem Server wird dadurch nie angetastet.
#
# Voraussetzungen (einmalig):
#   - SSH-Host-Alias hetzner-sportfoto in ~/.ssh/config
#   - /opt/fabu existiert auf dem Server und enthaelt .env.production
#   - externes Docker-Netzwerk "web" (Traefik) existiert
#
# Env-Overrides: SSH_HOST, REMOTE_DIR, HEALTHCHECK_URL

set -euo pipefail
cd "$(dirname "$0")/../.."

SSH_HOST="${SSH_HOST:-hetzner-sportfoto}"
REMOTE_DIR="${REMOTE_DIR:-/opt/fabu}"
# Achtung im Parallelbetrieb vor dem DNS-Cutover: diese URL zeigt auf den
# *oeffentlichen* Namen, und der steht bis zum Cutover noch auf dem alten
# Hostinger-VPS. Der Check meldet dann gruen, ohne den neuen Stack beruehrt zu
# haben. Bis dahin ueberschreiben, z. B.:
#   HEALTHCHECK_URL=https://78.46.70.46/api/version ./infra/scripts/deploy.sh
# (oder den Check ueberspringen und per Host-Header pruefen, siehe
# MIGRATION_HOSTINGER_TO_HETZNER.md §17.5). Nach dem Cutover stimmt es selbst.
HEALTHCHECK_URL="${HEALTHCHECK_URL:-https://app.fabu-online.de/api/version}"
COMPOSE="docker compose -f infra/docker-compose.prod.yml --env-file .env.production"

# Nur getrackte Aenderungen pruefen — untracked files landen ohnehin nie in
# `git archive HEAD`.
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "Uncommittete Aenderungen an getrackten Dateien (werden NICHT deployed, nur HEAD):"
  git status --short --untracked-files=no
  read -rp "Trotzdem HEAD deployen? [y/N] " CONFIRM
  [[ "$CONFIRM" == "y" || "$CONFIRM" == "Y" ]] || { echo "Abgebrochen."; exit 1; }
fi

echo "=== FaBu Deploy: $(git rev-parse --short HEAD) ($(git log -1 --pretty=%s)) ==="

echo "--- 1/3: Code nach $SSH_HOST:$REMOTE_DIR uebertragen ---"
git archive --format=tar HEAD | ssh "$SSH_HOST" "tar -x -C $REMOTE_DIR"

echo "--- 2/3: Images bauen, Container neu starten ---"
# --build baut api, web und landing. worker benutzt das api-Image und muss
# deshalb im selben Lauf mit hoch, sonst laeuft er auf dem alten Stand weiter.
ssh "$SSH_HOST" "cd $REMOTE_DIR && $COMPOSE up -d --build"

echo "--- 3/3: Health-Check ---"
# Mehrere Versuche statt einmal fix warten: Postgres-Healthcheck, Node-Start
# und der erste Traefik-Durchgriff brauchen zusammen ein paar Sekunden.
STATUS="000"
for _ in 1 2 3 4 5 6 7 8; do
  sleep 4
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTHCHECK_URL" 2>/dev/null) || true
  [[ "$STATUS" == "200" ]] && break
done

if [[ "$STATUS" != "200" ]]; then
  echo "WARNUNG: $HEALTHCHECK_URL antwortete mit $STATUS (erwartet 200). Logs pruefen:"
  echo "  ssh $SSH_HOST docker logs fabu-api --tail 50"
  echo "  ssh $SSH_HOST docker logs fabu-web --tail 50"
  exit 1
fi

echo "=== Deploy abgeschlossen: $HEALTHCHECK_URL -> $STATUS ==="
