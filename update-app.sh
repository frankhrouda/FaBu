#!/bin/bash

# Skript zum Update der App auf dem Server
# Führe dies als deploy-User aus: ./update-app.sh

set -e

echo "=== Update der FaBu-App ==="

# 1. Code aktualisieren
echo "Aktualisiere Code..."
cd /home/deploy/FaBu
git pull origin main

# 2. Backend-Abhängigkeiten installieren (falls neue hinzugekommen)
echo "Installiere Backend-Abhängigkeiten..."
cd backend
npm install --production

# 3. Frontend neu bauen
echo "Baue Frontend neu..."
cd ../frontend
npm install
npm run build

# 4. Backend neu starten
echo "Starte Backend neu..."
pm2 restart fabu-backend

# 5. Nginx neu laden
echo "Lade Nginx neu..."
sudo systemctl reload nginx

echo "=== Update abgeschlossen! ==="
echo "Teste: https://fabu-online.de"