#!/bin/bash

# Skript: Deployment auf Produktionsserver
# Auf Prod (VPS) ausführen: chmod +x deploy-prod.sh && ./deploy-prod.sh

set -e

echo "=== Deploy FaBu Production ==="

cd /home/deploy/FaBu

echo "1) Git Pull from main"
# Automatisches Stashen, wenn ungestagte Änderungen vorhanden
if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "Ungestagte Änderungen gefunden – stashe automatisch..."
    git stash push -m "Auto-stash vor Deploy $(date)"
    STASHED=true
else
    STASHED=false
fi
git config pull.rebase true
git pull --rebase origin main
if [ "$STASHED" = true ]; then
    echo "Stash wiederherstellen..."
    git stash pop || echo "Stash-Pop fehlgeschlagen – prüfe manuell."
fi

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
