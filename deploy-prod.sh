#!/bin/bash

# Skript: Deployment auf Produktionsserver
# Auf Prod (VPS) ausführen: chmod +x deploy-prod.sh && ./deploy-prod.sh

set -euo pipefail

echo "=== Deploy FaBu Production ==="

cd /home/deploy/FaBu

echo "1) Git Pull from main"
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo "Fehler: Aktueller Branch ist '$CURRENT_BRANCH' (erwartet: main)."
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Fehler: Lokale Änderungen vorhanden. Deployment wird abgebrochen."
  echo "Bitte zuerst aufräumen (commit/stash/reset) und erneut deployen."
  git status --short
  exit 1
fi

git fetch origin main
git pull --ff-only origin main

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
