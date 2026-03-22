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

echo "2) Backend installieren"
cd backend
npm install --production

echo "3) Frontend installieren und bauen"
cd ../frontend
npm install
npm run build

echo "4) Frontend Deploy nach /var/www/html/fabu"
sudo rm -rf /var/www/html/fabu
sudo mkdir -p /var/www/html/fabu
sudo cp -r dist/* /var/www/html/fabu/
sudo chown -R www-data:www-data /var/www/html/fabu
sudo chmod -R 755 /var/www/html/fabu

echo "5) Backend mit pm2 neu starten"
cd ../backend
if pm2 status fabu-backend | grep -q "online"; then
  pm2 restart fabu-backend
else
  pm2 start src/index.js --name fabu-backend
fi
pm2 save

echo "6) Nginx-Konfiguration prüfen und reload"
sudo nginx -t
sudo systemctl reload nginx

echo "✅ Deployment abgeschlossen"
