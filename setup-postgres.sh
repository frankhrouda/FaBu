#!/bin/bash

# Skript: PostgreSQL lokal für FaBu einrichten
# Verwendung:
#   chmod +x setup-postgres.sh
#   ./setup-postgres.sh
#
# Voraussetzung: PostgreSQL ist installiert und läuft.
#   Ubuntu/Debian: sudo apt install -y postgresql postgresql-contrib
#                  sudo systemctl start postgresql && sudo systemctl enable postgresql

set -euo pipefail

DB_NAME="${FABU_DB_NAME:-fabu}"
DB_USER="${FABU_DB_USER:-fabu}"
DB_PASS="${FABU_DB_PASS:-fabu_local_pw}"

echo "=== FaBu PostgreSQL Setup ==="
echo "Datenbank : $DB_NAME"
echo "Nutzer    : $DB_USER"
echo ""

# Prüfen ob PostgreSQL läuft
if ! pg_isready -q; then
  echo "❌ PostgreSQL läuft nicht. Bitte zuerst starten:"
  echo "   sudo systemctl start postgresql"
  exit 1
fi

echo "1) Erstelle Datenbank-Nutzer '$DB_USER' (falls nicht vorhanden)..."
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" \
  | grep -q 1 \
  && echo "   Nutzer existiert bereits, überspringe." \
  || sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';"

echo "2) Erstelle Datenbank '$DB_NAME' (falls nicht vorhanden)..."
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" \
  | grep -q 1 \
  && echo "   Datenbank existiert bereits, überspringe." \
  || sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"

echo "3) Vergebe Berechtigungen..."
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"

echo "4) Verbindungstest..."
PGPASSWORD="$DB_PASS" psql -U "$DB_USER" -d "$DB_NAME" -h localhost -c "SELECT 1 AS ok;" -q \
  && echo "   ✅ Verbindung erfolgreich." \
  || { echo "   ❌ Verbindung fehlgeschlagen. Prüfe pg_hba.conf."; exit 1; }

echo ""
echo "✅ PostgreSQL-Setup abgeschlossen."
echo ""
echo "Trage folgende Werte in backend/.env ein:"
echo ""
echo "   DATABASE_URL=postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME"
echo "   DB_CLIENT=postgres"
echo ""
echo "Oder kopiere backend/.env.example zu backend/.env und passe die Werte an."
