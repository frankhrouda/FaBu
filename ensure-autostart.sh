#!/bin/bash
# Skript zur Sicherstellung, dass PostgreSQL und PM2 nach Systemstart automatisch laufen
# Führe als deploy-User mit sudo aus: sudo ./ensure-autostart.sh

set -e

echo "=== Konfigurieren von Autostart für FaBu Services ==="
echo ""

# 1. PostgreSQL Autostart sicherstellen
echo "1️⃣  Aktiviere PostgreSQL Autostart..."
sudo systemctl enable postgresql || {
  echo "   ⚠️  Warnung: PostgreSQL ist möglicherweise nicht installiert"
  echo "   Installation: sudo apt install -y postgresql postgresql-contrib"
}
sudo systemctl is-enabled postgresql && echo "   ✅ PostgreSQL Autostart aktiviert" || echo "   ⚠️  PostgreSQL Autostart nicht verfügbar"

# 2. PM2 Startup Hook installieren
echo ""
echo "2️⃣  Installiere PM2 Startup Hook..."

# Prüfe ob PM2 installiert ist
if ! command -v pm2 &> /dev/null; then
  echo "   ❌ PM2 nicht gefunden. Installiere mit: sudo npm install -g pm2"
  exit 1
fi

# Generiere PM2 systemd service
sudo pm2 startup systemd -u deploy --hp /home/deploy || {
  echo "   ⚠️  PM2 startup konnte nicht konfiguriert werden"
  exit 1
}

# Speichere aktuelle PM2 Apps
pm2 save || echo "   ⚠️  Warnung: PM2 Apps konnten nicht gespeichert werden"

echo "   ✅ PM2 Startup Hook installiert"

# 3. Systemd Service prüfen
echo ""
echo "3️⃣  Prüfe systemd Services..."

sudo systemctl daemon-reload

if sudo systemctl is-enabled pm2-deploy &>/dev/null 2>&1; then
  echo "   ✅ pm2-deploy Service aktiviert"
else
  echo "   ⚠️  pm2-deploy Service nicht aktiviert"
  echo "   Versuche zu aktivieren..."
  sudo systemctl enable pm2-deploy 2>/dev/null || echo "   ⚠️  Konnte pm2-deploy nicht aktivieren"
fi

# 4. Nginx Autostart (optional)
echo ""
echo "4️⃣  Aktiviere Nginx Autostart..."
sudo systemctl enable nginx && echo "   ✅ Nginx Autostart aktiviert" || echo "   ⚠️  Nginx Autostart fehlgeschlagen"

echo ""
echo "=== Autostart-Konfiguration abgeschlossen ==="
echo ""
echo "Prüfung der Dienste:"
sudo systemctl status --no-pager postgresql || echo "  PostgreSQL läuft nicht"
sudo systemctl status --no-pager pm2-deploy || echo "  PM2 Service läuft nicht"
sudo systemctl status --no-pager nginx || echo "  Nginx läuft nicht"
echo ""
echo "Nach dem nächsten Neustart sollten folgende Services automatisch starten:"
echo "  ✓ PostgreSQL"
echo "  ✓ PM2 (mit FaBu Backend)"
echo "  ✓ Nginx"
