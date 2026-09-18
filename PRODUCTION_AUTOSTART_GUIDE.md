# FaBu Production Issue: PostgreSQL Autostart

## Problem
Nach Server-Reboot nach Wartung: **HTTP 502** bei Anmeldung
- PostgreSQL startet nicht automatisch
- PM2 Apps starten nicht automatisch
- Backend crasht wegen fehlender DB-Verbindung
- Fehlermeldung ist generisch und nicht hilfreich für Diagnose

## Lösung

### 1. PostgreSQL Autostart konfigurieren

```bash
# Als root/sudo:
sudo systemctl enable postgresql
sudo systemctl status postgresql

# Service sollte auto-starten nach Reboot
sudo reboot
```

### 2. PM2 Startup-Hook installieren

```bash
cd /home/deploy/FaBu

# Generiere systemd Service für PM2 Apps
sudo pm2 startup systemd -u deploy --hp /home/deploy

# Speichere aktuelle PM2 Apps (Backend)
pm2 save

# Verifi
sudo systemctl status pm2-deploy
```

### 3. Automated Setup (neu: ensure-autostart.sh)

Alternativ: Ein neues Skript automatisiert alles:

```bash
chmod +x ensure-autostart.sh
sudo ./ensure-autostart.sh
```

Das Skript:
- ✅ Aktiviert PostgreSQL Autostart
- ✅ Konfiguriert PM2 systemd Integration
- ✅ Aktiviert Nginx Autostart
- ✅ Verifiziert Services

### 4. Health-Check nach Reboot (neu: health-check.sh)

```bash
chmod +x health-check.sh
./health-check.sh
```

Prüft automatisch:
- PostgreSQL läuft und ist verbunden
- Backend läuft (PM2)
- Nginx läuft
- API ist erreichbar

## Verbesserte Fehlerbehandlung

### Error-Code System (neu)

Alle Fehler haben jetzt eindeutige Codes mit Format: **FBE[XXXXX]**

**Bereiche:**
- `FBE10000-19999`: Database-Fehler
- `FBE20000-29999`: Auth-Fehler
- `FBE30000-39999`: Validation-Fehler
- `FBE40000-49999`: Authorization-Fehler
- `FBE50000-59999`: Business Logic
- `FBE60000-69999`: External Services (Mail, etc)
- `FBE70000-79999`: Internal Server Errors

### Beispiel Error Response

**Vorher (generisch):**
```json
{
  "error": "Interner Serverfehler"
}
```

**Nachher (hilfreich):**
```json
{
  "error": "Datenbankverbindung fehlgeschlagen. Der Datenbankserver antwortet nicht.",
  "code": "FBE10002",
  "errorId": "ERR-20260422-1713880190ABC123",
  "timestamp": "2026-04-22T10:15:30.123Z"
}
```

**Support-Information:**
- `code`: Support kann das Problem direkt identifizieren
- `errorId`: Eindeutige Fehler-ID für Logging und Diagnose
- `error`: Kundenfreundliche Beschreibung

### Backend Startup-Fehlerbehandlung (neu)

Wenn der Server nicht starten kann, gibt es jetzt Diagnose-Tipps:

```
❌ KRITISCHER FEHLER beim Starten des Servers:
PostgreSQL Verbindung fehlgeschlagen

📋 Diagnose: PostgreSQL ist nicht erreichbar
   - Ist PostgreSQL gestartet? (sudo systemctl status postgresql)
   - Stimmen die DATABASE_URL Einstellungen in .env?
   - DATABASE_URL: postgresql://fabu:****@localhost:5432/fabu
```

## Deployment Checkliste Update

Wenn neuer Server aufgesetzt wird oder nach Major-Überholungen:

**Nach Backend-Deployment:**
```bash
cd /home/deploy/FaBu/backend

# 1. Dependencies
npm install --production

# 2. Start mit PM2
pm2 start src/index.js --name fabu-backend
pm2 save

# 3. Autostart konfigurieren
sudo ./ensure-autostart.sh

# 4. Verifizie mit Health-Check
./health-check.sh

# 5. Test nach Reboot
sudo reboot
# Nach Reboot erneut health-check.sh ausführen
```

## Verwandte Dateien

- [`errorCodes.js`](../../backend/src/utils/errorCodes.js) - Error-Code System
- [`ensure-autostart.sh`](../../ensure-autostart.sh) - Autostart-Konfiguration
- [`health-check.sh`](../../health-check.sh) - Service Health-Check
- [`SERVER_DEPLOYMENT_CHECKLIST.md`](../../SERVER_DEPLOYMENT_CHECKLIST.md) - Vollständige Deployment-Anleitung

## Testing

### Lokal testen (SQLite)
```bash
cd backend
npm install
npm run dev
# Sollte ohne Fehler starten
```

### PostgreSQL-Connection testen
```bash
# In .env: DB_CLIENT=postgres
npm run dev
# Sollte besseren Fehler geben wenn Postgres nicht läuft:
# "PostgreSQL Verbindung fehlgeschlagen"
```

### Health-Check lokal
```bash
./health-check.sh
```

## Zukunftsverbesserungen

- [ ] Monitoring-Dashboard (z.B. mit PM2 Plus)
- [ ] Automatische Benachrichtigungen bei Service-Ausfällen
- [ ] Automatisches Restart von Services
- [ ] Database Backup-Automation
