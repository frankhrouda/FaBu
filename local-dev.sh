#!/bin/bash

# Skript: lokales Setup + Start-Hilfe für FaBu
# Verwendung:
#   chmod +x local-dev.sh
#   ./local-dev.sh

set -e

echo "=== Lokales Development-Setup FaBu ==="

echo "1) Installiere Backend-Abhängigkeiten..."
cd backend
npm install

echo "2) Installiere Frontend-Abhängigkeiten..."
cd ../frontend
npm install

cat <<'EOF'

✅ Installation fertig.

Konfiguration:
  cp backend/.env.example backend/.env
  # JWT_SECRET und optional DB_CLIENT/DATABASE_URL anpassen.
  # Für PostgreSQL: ./setup-postgres.sh

Starte dann in zwei Terminals:
  Terminal A: cd backend && npm run dev
  Terminal B: cd frontend && npm run dev

Frontend läuft auf: http://localhost:5173
Backend auf: http://localhost:3001

EOF
