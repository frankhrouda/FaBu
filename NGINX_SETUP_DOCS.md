# Nginx Setup: Landing + App auf separaten Subdomains

## Übersicht
- **Landing-Page**: `fabu-online.de` & `www.fabu-online.de` → `/var/www/html/fabu-landing`
- **App**: `app.fabu-online.de` → `/var/www/html/fabu` (Backend auf Port 3001)

## DNS Records
Folgende A-Einträge müssen auf deine VPS-IP zeigen:
```
fabu-online.de       A   187.124.170.226
www.fabu-online.de   A   187.124.170.226
app.fabu-online.de   A   187.124.170.226
```

## Server-Setup

Wichtig fuer die Landing-Page: Sie ist eine statische Astro-Site und keine Single-Page-App. Deshalb darf die Nginx-Config nicht pauschal auf `/index.html` zurueckfallen, sonst werden Seiten wie `/impressum` oder `/datenschutz` wieder auf die Startseite geleitet.

### 1. Verzeichnisse anlegen
```bash
sudo mkdir -p /var/www/html/fabu-landing
sudo mkdir -p /var/www/html/fabu
sudo chown -R deploy:www-data /var/www/html/fabu-landing
sudo chown -R deploy:www-data /var/www/html/fabu
sudo chmod -R 755 /var/www/html/fabu-landing
sudo chmod -R 755 /var/www/html/fabu
```

### 2. Nginx-Configs konfigurieren

#### Landing-Page aktivieren
```bash
sudo cp /home/deploy/FaBu/nginx-config-landing-example /etc/nginx/sites-available/fabu-landing
sudo ln -s /etc/nginx/sites-available/fabu-landing /etc/nginx/sites-enabled/fabu-landing
```

Die relevante Landing-Regel sollte so aussehen:
```nginx
location / {
  try_files $uri $uri/ $uri.html =404;
}
```

#### App aktivieren
```bash
sudo cp /home/deploy/FaBu/nginx-config-app-example /etc/nginx/sites-available/fabu-online
sudo ln -s /etc/nginx/sites-available/fabu-online /etc/nginx/sites-enabled/fabu-online
```

Wichtiger App-Hinweis (API und Uploads):
```nginx
location ^~ /api/ {
  proxy_pass http://localhost:3001;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}

location ^~ /uploads/ {
  proxy_pass http://localhost:3001;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

Hinweis zu Prioritaet:
- Die Prefix-Locations mit `^~` muessen vor allgemeinen Regex-Caching-Regeln stehen.
- Sonst koennen Bild-URLs wie `/api/uploads/vehicles/*.jpg` faelschlich als statische Frontend-Datei behandelt werden.

#### Test & Reload
```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 3. HTTPS mit Certbot aktivieren

```bash
sudo certbot --nginx \
  -d fabu-online.de \
  -d www.fabu-online.de \
  -d app.fabu-online.de
```

Certbot wird:
- Zertifikate für alle drei Domains ausstellen
- Nginx-Configs automatisch anpassen (HTTP → HTTPS Redirect)
- Auto-Renewal konfigurieren

### 4. Backend starten (falls noch nicht laufen)
```bash
cd /home/deploy/FaBu/backend
pm2 start src/index.js --name fabu-backend
pm2 save
```

### 5. Deployments

**Landing deployen:**
```bash
cd /home/deploy/FaBu
./deploy-landing.sh
```

**App deployen:**
```bash
cd /home/deploy/FaBu
./deploy-prod.sh
```

## Nginx-Struktur nach Setup
```
/etc/nginx/sites-enabled/
├── fabu-landing  → /etc/nginx/sites-available/fabu-landing
└── fabu-online   → /etc/nginx/sites-available/fabu-online
```

## Testing

```bash
# Landing erreichbar?
curl -I https://fabu-online.de
curl -I https://www.fabu-online.de

# App erreichbar?
curl -I https://app.fabu-online.de

# Backend API erreichbar?
curl https://app.fabu-online.de/api/health  # (wenn Endpoint vorhanden)
```

## Troubleshooting

**Nginx testet die Config vorher:**
```bash
sudo nginx -t
```

**Landing-Seiten wie `/impressum` oder `/datenschutz` landen auf der Startseite:**
```bash
sudo sed -i 's/try_files $uri $uri\/ \/index.html;/try_files $uri $uri\/ $uri.html =404;/' /etc/nginx/sites-available/fabu-landing
sudo nginx -t
sudo systemctl reload nginx
```

**Nginx Logs prüfen:**
```bash
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log
```

**Fahrzeugbilder fehlen in der App:**
```bash
# 1) Pruefen, ob Bild ueber API-Pfad erreichbar ist
curl -I https://app.fabu-online.de/api/uploads/vehicles/DATEINAME.jpg

# 2) App-Config pruefen
sudo grep -n "location \^~ /api/\|location \^~ /uploads/" /etc/nginx/sites-available/fabu-online

# 3) Nginx neu laden
sudo nginx -t
sudo systemctl reload nginx
```

**Backend Port 3001 blockt?**
```bash
sudo ufw allow 3001  # Nur lokal nötig, da Nginx Proxy ist
```

**Certbot Auto-Renewal prüfen:**
```bash
sudo systemctl status certbot.timer
sudo certbot renew --dry-run
```
