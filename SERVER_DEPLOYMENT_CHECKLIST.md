# FaBu Server-Deployment Checkliste

## Aktueller Ist-Stand

- Produktion ist live auf `app.fabu-online.de`
- Backend läuft produktiv mit PM2 und PostgreSQL
- Landing läuft getrennt unter `fabu-online.de`
- Diese Checkliste ist weiterhin für Neuaufbau und Verifikation gedacht, nicht als reiner Statusreport

## 1. Host-Vorbereitung (einmalig)
- [ ] VPS mit Ubuntu 24.04 + SSH-Key Setup
- [ ] `./install-server.sh` ausführen (Node.js, Nginx, PM2, Certbot, etc.)
- [ ] `setup-user.sh` ausführen (Deploy-User anlegen)
- [ ] Git Repo klonen: `git clone https://github.com/frankhrouda/FaBu.git`

## 2. Database Setup
- [ ] PostgreSQL oder SQLite entscheiden
- [ ] Falls PostgreSQL: `./setup-postgres.sh` ausführen
- [ ] `backend/.env` mit JWT_SECRET und DB_CLIENT setzen

## 3. DNS einrichten (bei Registrar)
- [ ] A-Record: `fabu-online.de` → VPS-IP
- [ ] A-Record: `www.fabu-online.de` → VPS-IP
- [ ] A-Record: `app.fabu-online.de` → VPS-IP
- [ ] DNS-Records prüfen: `nslookup fabu-online.de`

## 4. Nginx konfigurieren (Server)
```bash
# Landing aktivieren
sudo cp nginx-config-landing-example /etc/nginx/sites-available/fabu-landing
sudo ln -s /etc/nginx/sites-available/fabu-landing /etc/nginx/sites-enabled/

# App aktivieren
sudo cp nginx-config-app-example /etc/nginx/sites-available/fabu-online
sudo ln -s /etc/nginx/sites-available/fabu-online /etc/nginx/sites-enabled/

# Test & Reload
sudo nginx -t
sudo systemctl reload nginx
```

Landing-Hinweis:
```nginx
location / {
  try_files $uri $uri/ $uri.html =404;
}
```

App-Hinweis (API + Uploads):
```nginx
location ^~ /api/ {
  proxy_pass http://localhost:3001;
}

location ^~ /uploads/ {
  proxy_pass http://localhost:3001;
}
```

- [ ] App-Config-Datei ist `/etc/nginx/sites-available/fabu-online`
- [ ] API-Proxy ist als `location ^~ /api/` gesetzt
- [ ] Upload-Proxy ist als `location ^~ /uploads/` gesetzt

- [ ] Nginx-Configs aktiviert
- [ ] `sudo nginx -t` ohne Fehler

## 5. HTTPS einrichten (Server)
```bash
sudo certbot --nginx \
  -d fabu-online.de \
  -d www.fabu-online.de \
  -d app.fabu-online.de
```

- [ ] Zertifikate ausgestellt
- [ ] Auto-Renewal aktiv

## 6. Backend starten (Server)
```bash
cd /home/deploy/FaBu/backend
npm install --production
pm2 start src/index.js --name fabu-backend
pm2 save
sudo systemctl restart pm2-deploy  # oder systemd-Service
```

- [ ] Backend läuft auf Port 3001
- [ ] PM2 Startup konfiguriert

## 7. Landing deployen (Server)
```bash
cd /home/deploy/FaBu
./deploy-landing.sh
```

- [ ] Landing in `/var/www/html/fabu-landing` deployed
- [ ] Erreichbar unter `https://fabu-online.de`

## 8. App deployen (Server)
```bash
cd /home/deploy/FaBu
./deploy-prod.sh
```

- [ ] Frontend in `/var/www/html/fabu` deployed
- [ ] Erreichbar unter `https://app.fabu-online.de`
- [ ] API proxy funktioniert

## 9. Testen
```bash
# Landing
curl -I https://fabu-online.de
curl -I https://www.fabu-online.de

# App
curl -I https://app.fabu-online.de

# API
curl -X POST https://app.fabu-online.de/api/auth/login -H 'Content-Type: application/json' -d '{}'
```

- [ ] Alle URLs erreichbar
- [ ] HTTPS funktioniert (kein Zertifikat-Fehler)
- [ ] API Response erhalten

## 10. Backups & Monitoring

### Sofort nach jedem Release (0-2h)
- [ ] PM2-Prozess ist online: `pm2 status`
- [ ] Nginx ist healthy: `sudo systemctl status nginx --no-pager`
- [ ] Kritische Backend-Logs prüfen: `pm2 logs fabu-backend --lines 100 --nostream | grep -Ei "error|exception|timeout|postgres|database" || true`
- [ ] Nginx-Error-Log prüfen: `sudo tail -n 100 /var/log/nginx/error.log`
- [ ] Login-Endpoint Smoke-Test: `curl -s -o /dev/null -w "%{http_code}\n" -X POST https://app.fabu-online.de/api/auth/login -H 'Content-Type: application/json' -d '{}'`

### Nach 24 Stunden
- [ ] Wiederholung Log-Check auf Fehlertrend (Backend + Nginx)
- [ ] PM2-Restart-Zähler prüfen: `pm2 show fabu-backend | grep -i "restarts"`
- [ ] Stichprobe zentraler Flows (Login, Fahrzeuge, Reservierung, Mandantenverwaltung)

### Tägliche Routine
- [ ] PostgreSQL-Backup erzeugen (`pg_dump`)
- [ ] Backup-Datei auf Dateigröße > 0 und Datum prüfen
- [ ] Verfügbaren Speicher prüfen: `df -h`

Beispiel-Backupskript (`/home/deploy/FaBu/scripts/backup-postgres.sh`):
```bash
#!/usr/bin/env bash
set -euo pipefail

set -a
. /home/deploy/FaBu/backend/.env
set +a

BACKUP_DIR="/home/deploy/FaBu/backend/data/postgres-backups"
mkdir -p "$BACKUP_DIR"

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/fabu-postgres-$STAMP.sql.gz"

pg_dump "$DATABASE_URL" | gzip > "$OUT"
chmod 600 "$OUT"

# Aufbewahrung: 14 Tage
find "$BACKUP_DIR" -type f -name 'fabu-postgres-*.sql.gz' -mtime +14 -delete
```

Cron-Beispiel (taeglich 02:30):
```bash
crontab -e
30 2 * * * /home/deploy/FaBu/scripts/backup-postgres.sh >> /home/deploy/FaBu/backend/data/postgres-backups/backup.log 2>&1
```

### Wöchentliche Routine
- [ ] Restore-Test gegen Testdatenbank durchfuehren (Backup ist nur valide, wenn Restore klappt)
- [ ] PM2/Nginx-Logs auf wiederkehrende Warnungen prüfen

Beispiel Restore-Test:
```bash
set -a
. /home/deploy/FaBu/backend/.env
set +a

LATEST_BACKUP="$(ls -1t /home/deploy/FaBu/backend/data/postgres-backups/fabu-postgres-*.sql.gz | head -n 1)"
test -n "$LATEST_BACKUP"

createdb fabu_restore_test || true
gunzip -c "$LATEST_BACKUP" | psql "postgresql://localhost/fabu_restore_test"
psql "postgresql://localhost/fabu_restore_test" -c "SELECT COUNT(*) FROM users;"
dropdb fabu_restore_test
```

### Laufende Betriebschecks
- [ ] Logrotation für Nginx/App-Logs aktiv halten
- [ ] PM2 Monitoring bei Bedarf: `pm2 monitor`
- [ ] Firewall-Status prüfen: `sudo ufw status`

## Quick Commands (Server)

**Logs prüfen:**
```bash
pm2 logs fabu-backend
sudo tail -f /var/log/nginx/error.log
```

**Backend neu starten:**
```bash
pm2 restart fabu-backend
```

**Nginx neu laden:**
```bash
sudo nginx -t && sudo systemctl reload nginx
```

**Deployment wiederholen:**
```bash
cd /home/deploy/FaBu && git pull && ./deploy-prod.sh
```

**Wichtiger Post-Deploy-Check:**
```bash
pm2 restart fabu-backend
curl -X POST https://app.fabu-online.de/api/auth/login -H 'Content-Type: application/json' -d '{}'
pm2 logs fabu-backend --lines 20 --nostream
```

## Domains & Routing

| Domain | Root | Backend | Zweck |
|--------|------|---------|-------|
| `fabu-online.de` | `/var/www/html/fabu-landing` | — | Marketing/Landing-Page |
| `www.fabu-online.de` | `/var/www/html/fabu-landing` | — | Landing-Page Alias |
| `app.fabu-online.de` | `/var/www/html/fabu` | localhost:3001 | Hauptapp + API Proxy |
