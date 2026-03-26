# Produktions-Migrationschecklist: SQLite → PostgreSQL

## Status
- ✅ Backup erstellt: `fabu-20260325-151604.db` (28K)
- ❌ Migrationsmarker fehlt → Migration noch nicht durchgeführt

## Diagnose auf dem Server

### Schritt D1: Prüfen, ob PostgreSQL erreichbar ist
```bash
set -a
. backend/.env
set +a

echo "DATABASE_URL: $DATABASE_URL"
echo "DB_CLIENT: ${DB_CLIENT:-nicht gesetzt}"

psql "$DATABASE_URL" -c "SELECT version();"
```

### Schritt D2: Prüfen, ob die Postgres-Datenbank leer ist
```bash
psql "$DATABASE_URL" -c "SELECT tablename FROM pg_tables WHERE schemaname='public';"
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM users; SELECT COUNT(*) FROM vehicles; SELECT COUNT(*) FROM reservations;"
```

### Schritt D3: Backend-Logs prüfen
```bash
pm2 logs fabu-backend --lines 100 --nostream | grep -A 5 -B 5 "migrate\|postgre\|error\|Error"
```

### Schritt D4: Manuelle Migration ausführen (falls nötig)
```bash
cd backend
LATEST_BACKUP="$(ls -1t data/sqlite-backups/fabu-*.db | head -n 1)"
echo "Verwende Backup: $LATEST_BACKUP"

SQLITE_DB_PATH="$LATEST_BACKUP" npm run migrate:sqlite-to-postgres
```

### Schritt D5: Nach erfolgreicher Migration
```bash
touch backend/data/.sqlite_to_postgres_migrated
pm2 restart fabu-backend
```

### Schritt D6: Verifikation
```bash
# Zähle Datensätze im Backup
LATEST_BACKUP="$(ls -1t backend/data/sqlite-backups/fabu-*.db | head -n 1)"
echo "=== SQLite Backup: $LATEST_BACKUP ==="
sqlite3 "$LATEST_BACKUP" "SELECT 'users', COUNT(*) FROM users UNION ALL SELECT 'vehicles', COUNT(*) FROM vehicles UNION ALL SELECT 'reservations', COUNT(*) FROM reservations;"

# Zähle Datensätze in PostgreSQL
echo "=== PostgreSQL ==="
set -a
. backend/.env
set +a
psql "$DATABASE_URL" -c "SELECT 'users' AS table, COUNT(*)::bigint AS count FROM users UNION ALL SELECT 'vehicles', COUNT(*)::bigint FROM vehicles UNION ALL SELECT 'reservations', COUNT(*)::bigint FROM reservations;"
```

---

## Schnelltest (alles auf einmal)
```bash
#!/bin/bash
cd ~/FaBu

echo "=== 🔍 Diagnose PostgreSQL ==="
set -a
. backend/.env
set +a

echo "1) Postgres erreichbar?"
psql "$DATABASE_URL" -c "SELECT 'OK' AS status;" 2>&1 | grep -q OK && echo "✅ Ja" || echo "❌ Nein"

echo ""
echo "2) Tabellen in Postgres vorhanden?"
TABLE_COUNT=$(psql "$DATABASE_URL" -tc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';" | xargs)
echo "Tabellen: $TABLE_COUNT (erwartet: 3)"

echo ""
echo "3) Backup vorhanden?"
LATEST_BACKUP="$(ls -1t backend/data/sqlite-backups/fabu-*.db 2>/dev/null | head -n 1)"
if [ -n "$LATEST_BACKUP" ]; then
  echo "✅ $LATEST_BACKUP"
  BACKUP_SIZE=$(stat -f%z "$LATEST_BACKUP" 2>/dev/null || stat -c%s "$LATEST_BACKUP" 2>/dev/null || echo "?")
  echo "   Größe: $BACKUP_SIZE Bytes"
else
  echo "❌ Kein Backup gefunden"
fi

echo ""
echo "4) Marker gesetzt?"
test -f backend/data/.sqlite_to_postgres_migrated && echo "✅ Ja" || echo "❌ Nein"

echo ""
echo "5) Datensätze im Backup?"
if [ -n "$LATEST_BACKUP" ]; then
  sqlite3 "$LATEST_BACKUP" "SELECT 'users: ' || COUNT(*) FROM users UNION ALL SELECT 'vehicles: ' || COUNT(*) FROM vehicles UNION ALL SELECT 'reservations: ' || COUNT(*) FROM reservations;" 2>/dev/null || echo "❌ SQLite-Datei lesbar?"
fi

echo ""
echo "6) Datensätze in Postgres?"
psql "$DATABASE_URL" -tc "SELECT 'users: ' || COUNT(*)::text FROM users UNION ALL SELECT 'vehicles: ' || COUNT(*)::text FROM vehicles UNION ALL SELECT 'reservations: ' || COUNT(*)::text FROM reservations;" 2>/dev/null || echo "❌ Postgres lesbar?"

echo ""
echo "=== 🎯 Migrationsstatus ==="
if [ -f backend/data/.sqlite_to_postgres_migrated ]; then
  echo "✅ Migration abgeschlossen"
else
  echo "⚠️  Migration noch nicht durchgeführt"
  echo ""
  echo "Nächste Schritte:"
  echo "1. PostgreSQL-Verbindung überprüfen (Schritt D1 oben)"
  echo "2. Manuelle Migration ausführen (Schritt D4 oben)"
fi
```

---

## Was ist schief gelaufen?

Die Migration hätte während des Deploys automatisch laufen sollen (siehe [deploy-prod.sh](deploy-prod.sh#L100)), wurde aber nicht durchgeführt. Wahrscheinliche Gründe:

1. **DATABASE_URL nicht richtig gesetzt** → `psql` kann nicht verbinden
2. **Postgres nicht erreichbar/nicht installiert** → Server-Fehler
3. **Deploy vor der Konfiguration ausgeführt** → DB_CLIENT=postgres oder DATABASE_URL fehlten
4. **npm run `migrate:sqlite-to-postgres` fehlgeschlagen** → Siehe Backend-Logs

---

## Nächster Schritt

Gib auf dem Server folgendes Kommando aus und teile mir die Ausgabe:

```bash
cd ~/FaBu && bash -x backend/.env 2>&1 | head -20 && echo "---" && psql "$DATABASE_URL" -c "SELECT version();" 2>&1
```

Dann kann ich dir die genaue Fehlerbehebung geben.
