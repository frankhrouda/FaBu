#!/bin/bash

# Deployment der statischen Landing-Page
# Ausfuehren auf dem Server: chmod +x deploy-landing.sh && ./deploy-landing.sh

set -euo pipefail

echo "=== Deploy FaBu Landing ==="

cd /home/deploy/FaBu/landing

echo "1) Dependencies installieren"
npm install

echo "2) Build erstellen"
npm run build

echo "3) Dateien nach /var/www/html/fabu-landing ausrollen"
sudo mkdir -p /var/www/html/fabu-landing
sudo rsync -av --delete dist/ /var/www/html/fabu-landing/
sudo chown -R www-data:www-data /var/www/html/fabu-landing
sudo chmod -R 755 /var/www/html/fabu-landing

echo "4) Nginx pruefen und reload"
sudo nginx -t
sudo systemctl reload nginx

echo "✅ Landing deployment abgeschlossen"
