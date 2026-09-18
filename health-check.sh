#!/bin/bash
# Health-Check Script für FaBu Services in Produktion
# Überprüft, ob PostgreSQL, PM2 und der Backend laufen
# Verwendung: ./health-check.sh

set -e

echo "=== FaBu Health Check ==="
echo ""

STATUS=0

# 1. PostgreSQL Check
echo "1️⃣  PostgreSQL Check..."
if sudo systemctl is-active --quiet postgresql; then
  echo "   ✅ PostgreSQL läuft"
  
  # Versuche Verbindung zu testen
  if command -v psql &> /dev/null; then
    if PGPASSWORD="${FABU_DB_PASS:-fabu_local_pw}" psql -U "${FABU_DB_USER:-fabu}" -d "${FABU_DB_NAME:-fabu}" -h localhost -c "SELECT 1;" -q 2>/dev/null; then
      echo "   ✅ PostgreSQL Verbindung OK"
    else
      echo "   ⚠️  PostgreSQL antwortet nicht"
      STATUS=1
    fi
  fi
else
  echo "   ❌ PostgreSQL läuft NICHT"
  echo "      Start mit: sudo systemctl start postgresql"
  STATUS=1
fi

# 2. PM2 Check
echo ""
echo "2️⃣  PM2 & Backend Check..."
if command -v pm2 &> /dev/null; then
  if pm2 list 2>/dev/null | grep -q "fabu-backend"; then
    STATUS_LINE=$(pm2 list 2>/dev/null | grep "fabu-backend" || echo "")
    if echo "$STATUS_LINE" | grep -q "online"; then
      echo "   ✅ FaBu Backend läuft (PM2)"
    else
      echo "   ⚠️  FaBu Backend läuft nicht (PM2 zeigt als offline)"
      echo "      Starte mit: pm2 start src/index.js --name fabu-backend"
      STATUS=1
    fi
  else
    echo "   ⚠️  FaBu Backend nicht im PM2 registriert"
    STATUS=1
  fi
else
  echo "   ⚠️  PM2 nicht installiert"
  STATUS=1
fi

# 3. Nginx Check
echo ""
echo "3️⃣  Nginx Check..."
if sudo systemctl is-active --quiet nginx; then
  echo "   ✅ Nginx läuft"
else
  echo "   ⚠️  Nginx läuft nicht"
  echo "      Start mit: sudo systemctl start nginx"
  STATUS=1
fi

# 4. API Connectivity Check
echo ""
echo "4️⃣  API Connectivity Check..."
if curl -s -f -o /dev/null -w "%{http_code}" http://localhost:3001/api/version 2>/dev/null | grep -q "200"; then
  echo "   ✅ Backend API erreichbar (Port 3001)"
else
  echo "   ⚠️  Backend API nicht erreichbar"
  STATUS=1
fi

# 5. HTTPS Check
if command -v curl &> /dev/null; then
  echo ""
  echo "5️⃣  HTTPS Connectivity Check..."
  RESPONSE=$(curl -s -k https://app.fabu-online.de/api/version 2>&1 || echo "")
  if echo "$RESPONSE" | grep -q "backend_version"; then
    echo "   ✅ HTTPS API erreichbar"
  else
    echo "   ⚠️  HTTPS API nicht erreichbar"
    echo "      Response: $RESPONSE"
    STATUS=1
  fi
fi

echo ""
echo "=== Summary ==="
if [ $STATUS -eq 0 ]; then
  echo "✅ Alle Services laufen korrekt!"
else
  echo "⚠️  Es gibt Probleme mit einigen Services. Siehe oben für Details."
fi

exit $STATUS
