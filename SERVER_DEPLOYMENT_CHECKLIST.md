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
- [ ] Tägliche PostgreSQL-Backups einrichten
- [ ] Logrotation für Nginx/App-Logs
- [ ] PM2 Monitoring (optional): `pm2 monitor`
- [ ] UFW Firewall: `sudo ufw status`

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
