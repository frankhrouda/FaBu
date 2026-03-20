#!/bin/bash

# Skript zur Installation von Node.js, SQLite und Nginx auf dem VPS
# Führe dies als deploy-User aus: chmod +x install-server.sh && ./install-server.sh

set -e

echo "=== Installation von Node.js, SQLite und Nginx ==="

# 1. System aktualisieren
echo "Aktualisiere System..."
sudo apt update && sudo apt upgrade -y

# 2. Node.js installieren
echo "Installiere Node.js..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 3. SQLite installieren
echo "Installiere SQLite..."
sudo apt install -y sqlite3

# 4. Git installieren
echo "Installiere Git..."
sudo apt install -y git

# 5. Nginx installieren
echo "Installiere Nginx..."
sudo apt install -y nginx

# 6. PM2 installieren
echo "Installiere PM2..."
sudo npm install -g pm2

# 7. Certbot installieren
echo "Installiere Certbot..."
sudo apt install -y certbot python3-certbot-nginx

echo "=== Installation abgeschlossen! ==="
echo "Node.js Version: $(node --version)"
echo "NPM Version: $(npm --version)"
echo "SQLite Version: $(sqlite3 --version)"
echo "Nginx Status: $(sudo systemctl is-active nginx)"
echo ""
echo "Nächste Schritte:"
echo "1. Code deployen: git clone https://github.com/frankhrouda/FaBu.git"
echo "2. Abhängigkeiten installieren und bauen"
echo "3. Nginx konfigurieren (siehe Beispiel unten)"
echo "4. HTTPS mit Certbot aktivieren"