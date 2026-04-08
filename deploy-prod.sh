#!/bin/bash

# Skript: Deployment auf Produktionsserver
# Auf Prod (VPS) ausführen: chmod +x deploy-prod.sh && ./deploy-prod.sh
# Optional strikt ohne Auto-Sync: AUTO_SYNC=0 bash deploy-prod.sh

set -euo pipefail

echo "=== Deploy FaBu Production ==="

cd /home/deploy/FaBu

echo "1) Git Sync with origin/main"
AUTO_SYNC="${AUTO_SYNC:-1}"

# Auf Servern ist ein reiner chmod oft unerheblich; verhindert false-positive Dirty States.
git config core.fileMode false

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$CURRENT_BRANCH" != "main" ]; then
  if [ "$AUTO_SYNC" = "1" ]; then
    echo "Branch '$CURRENT_BRANCH' erkannt -> wechsle automatisch auf 'main'."
    git checkout main
  else
    echo "Fehler: Aktueller Branch ist '$CURRENT_BRANCH' (erwartet: main)."
    exit 1
  fi
fi

git fetch origin main

LOCAL_HEAD="$(git rev-parse HEAD)"
REMOTE_HEAD="$(git rev-parse origin/main)"
HAS_LOCAL_CHANGES=false
if ! git diff --quiet || ! git diff --cached --quiet; then
  HAS_LOCAL_CHANGES=true
fi

if [ "$HAS_LOCAL_CHANGES" = true ] || [ "$LOCAL_HEAD" != "$REMOTE_HEAD" ]; then
  if [ "$AUTO_SYNC" = "1" ]; then
    echo "Server-Repo ist nicht sauber/in sync -> setze auf origin/main zurueck."
    git reset --hard origin/main
  else
    echo "Fehler: Lokaler Zustand weicht von origin/main ab."
    git status --short
    echo "LOCAL_HEAD:  $LOCAL_HEAD"
    echo "REMOTE_HEAD: $REMOTE_HEAD"
    exit 1
  fi
fi

LOCAL_HEAD="$(git rev-parse HEAD)"
REMOTE_HEAD="$(git rev-parse origin/main)"
if [ "$LOCAL_HEAD" != "$REMOTE_HEAD" ]; then
  echo "Fehler: Lokaler Commit ($LOCAL_HEAD) ist nicht gleich origin/main ($REMOTE_HEAD)."
  exit 1
fi

echo "Deploye Commit: $(git rev-parse --short HEAD)"

echo "2) Sicherheitspruefung: backend/.env vorhanden?"
if [ ! -f "backend/.env" ]; then
  echo "FEHLER: backend/.env fehlt auf diesem Server."
  echo "Bitte einmalig anlegen:"
  echo "  SECRET=\$(node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\")"
  echo "  echo \"JWT_SECRET=\$SECRET\" > /home/deploy/FaBu/backend/.env"
  echo "  chmod 600 /home/deploy/FaBu/backend/.env"
  exit 1
fi

set -a
. backend/.env
set +a

if [ "${DB_CLIENT:-sqlite}" = "postgres" ] && [ -z "${DATABASE_URL:-}" ]; then
  echo "FEHLER: DB_CLIENT=postgres gesetzt, aber DATABASE_URL fehlt in backend/.env."
  exit 1
fi

echo "4) Backend installieren"
# Workspace-sicher: Backend ohne devDependencies installieren.
cd /home/deploy/FaBu
NPM_CONFIG_OMIT=dev npm install --workspace=backend --omit=dev

echo "5) Frontend installieren und bauen"
# Unabhaengig von Workspace-/Root-npm-Config installieren, damit devDependencies
# (u. a. @vitejs/plugin-react) fuer den Vite-Build sicher vorhanden sind.
cd /home/deploy/FaBu/frontend
NPM_CONFIG_PRODUCTION=false NPM_CONFIG_OMIT= NPM_CONFIG_INCLUDE=dev npm install --include=dev --workspaces=false

# Defensive Pruefung mit echter Modul-Resolution im Frontend-Verzeichnis.
if ! node --input-type=module -e "import('@vitejs/plugin-react')" >/dev/null 2>&1; then
  echo "FEHLER: @vitejs/plugin-react ist im Frontend nicht resolvable."
  echo "Bitte npm-Config auf dem Server pruefen (omit/include/prod)."
  npm config get production || true
  npm config get omit || true
  npm config get include || true
  exit 1
fi

npm run build

echo "6) Frontend Deploy nach /var/www/html/fabu"
sudo rm -rf /var/www/html/fabu
sudo mkdir -p /var/www/html/fabu
sudo cp -r dist/* /var/www/html/fabu/
sudo chown -R www-data:www-data /var/www/html/fabu
sudo chmod -R 755 /var/www/html/fabu

SQLITE_DB="/home/deploy/FaBu/backend/data/fabu.db"
SQLITE_BACKUP_DIR="/home/deploy/FaBu/backend/data/sqlite-backups"
SQLITE_MIGRATION_MARKER="/home/deploy/FaBu/backend/data/.sqlite_to_postgres_migrated"

if [ "${DB_CLIENT:-sqlite}" = "postgres" ] && [ -f "$SQLITE_DB" ]; then
  if [ "${FORCE_SQLITE_MIGRATION:-0}" = "1" ] || [ ! -f "$SQLITE_MIGRATION_MARKER" ]; then
    echo "6b) SQLite sichern und nach PostgreSQL migrieren"

    if pm2 describe fabu-backend >/dev/null 2>&1; then
      pm2 stop fabu-backend || true
    fi

    mkdir -p "$SQLITE_BACKUP_DIR"
    BACKUP_BASENAME="fabu-$(date +%Y%m%d-%H%M%S).db"
    BACKUP_PATH="$SQLITE_BACKUP_DIR/$BACKUP_BASENAME"

    if ! command -v sqlite3 >/dev/null 2>&1; then
      echo "FEHLER: sqlite3 ist auf dem Server nicht installiert. Backup nicht moeglich."
      exit 1
    fi

    sqlite3 "$SQLITE_DB" ".backup '$BACKUP_PATH'"
    chmod 600 "$BACKUP_PATH"

    SQLITE_DB_PATH="$BACKUP_PATH" npm run migrate:sqlite-to-postgres --workspace=backend
    touch "$SQLITE_MIGRATION_MARKER"
  else
    echo "6b) SQLite-Migration bereits abgeschlossen, ueberspringe Import"
  fi
fi

echo "7) Backend mit pm2 neu starten"
cd /home/deploy/FaBu
cd backend
if pm2 describe fabu-backend >/dev/null 2>&1; then
  pm2 restart fabu-backend
else
  pm2 start src/index.js --name fabu-backend
fi

echo "7b) Reminder Worker mit pm2 starten"
if pm2 describe fabu-reminder-worker >/dev/null 2>&1; then
  pm2 restart fabu-reminder-worker
else
  pm2 start src/workers/reminder-worker.js --name fabu-reminder-worker
fi
pm2 save

echo "8) Nginx-Konfiguration prüfen und reload"
sudo nginx -t
sudo systemctl reload nginx

echo "✅ Deployment abgeschlossen"
