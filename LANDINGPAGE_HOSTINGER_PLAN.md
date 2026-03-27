# FaBu Landing-Page auf Hostinger (Ubuntu 24.04) - Umsetzungsplan

## Ziel
Eine **separate** Landing-Page fuer FaBu bereitstellen (nicht in die bestehende App integriert), sauber getrennt auf eigener Subdomain.

Empfohlene Domains:
- App: `app.fabu-online.de` (bestehende Anwendung)
- Landing-Page: `www.fabu-online.de` oder `fabu-online.de`
- Optional spaeter Blog: `blog.fabu-online.de` (WordPress)

---

## Kurzfazit
Wenn ihr nicht regelmaessig Blog-Artikel und viel CMS-Content pflegt, ist eine **statische Landing-Page** die einfachere und robustere Loesung.

WordPress ist absolut moeglich, aber bringt mehr Wartung, Updates und Sicherheitsaufwand mit.

---

## Option A (Empfehlung): Statische Landing-Page

## Warum diese Option fuer FaBu passt
- Sehr schnell (Core Web Vitals leicht gut erreichbar)
- Wenig Angriffsfläche
- Keine Datenbank fuer die Landing noetig
- Geringe Betriebs- und Wartungskosten
- Passt zu eurem bestehenden Deployment-Know-how (Nginx + Build + Copy)

## Architektur
- Quellcode separat in eigenem Repo oder im gleichen Repo als neuer Ordner `landing/`
- Build-Output nach `/var/www/html/fabu-landing`
- Eigener Nginx-Server-Block fuer `fabu-online.de` / `www.fabu-online.de`
- Die App bleibt unter `app.fabu-online.de` oder weiter unter bestehender Domain (empfohlen: Umzug auf Subdomain fuer klare Trennung)

## Aufwand / Betrieb
- Initial: ca. 0.5 bis 1.5 Tage (Design + Inhalte + Deploy)
- Laufender Aufwand: sehr gering (nur Content-Updates + gelegentliche Node/Nginx-Wartung)
- Monatliche Zusatzkosten: praktisch 0 EUR (nur bestehender Server)

## Umsetzungsschritte
1. DNS setzen
- `A`-Record fuer `fabu-online.de` auf VPS-IP
- `A`-Record fuer `www.fabu-online.de` auf VPS-IP
- Optional `A`-Record fuer `app.fabu-online.de` auf VPS-IP

2. Landing-Ordner am Server
```bash
sudo mkdir -p /var/www/html/fabu-landing
sudo chown -R deploy:www-data /var/www/html/fabu-landing
sudo chmod -R 755 /var/www/html/fabu-landing
```

3. Nginx-Config fuer Landing
Datei: `/etc/nginx/sites-available/fabu-landing`
```nginx
server {
    listen 80;
    server_name fabu-online.de www.fabu-online.de;

    root /var/www/html/fabu-landing;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|webp)$ {
        expires 30d;
        add_header Cache-Control "public";
    }
}
```

Aktivieren:
```bash
sudo ln -s /etc/nginx/sites-available/fabu-landing /etc/nginx/sites-enabled/fabu-landing
sudo nginx -t
sudo systemctl reload nginx
```

4. HTTPS aktivieren
```bash
sudo certbot --nginx -d fabu-online.de -d www.fabu-online.de
```

5. Deploy-Workflow fuer Landing
Beispiel (Vite):
```bash
npm ci
npm run build
sudo rsync -av --delete dist/ /var/www/html/fabu-landing/
sudo chown -R www-data:www-data /var/www/html/fabu-landing
```

6. Trennung zur App
- CTA-Button auf Landing: `Zur App` -> `https://app.fabu-online.de/login`
- Optional auf bestehender App-Domain Redirect konfigurieren, falls Domain-Umzug erfolgt

## Risiken und Gegenmassnahmen
- Risiko: Domain-Mix fuehrt zu SEO/Tracking-Verwirrung
  - Gegenmassnahme: klare Canonical-URL, konsistente interne Links
- Risiko: Inhalte werden zu selten aktualisiert
  - Gegenmassnahme: quartalsweise Mini-Content-Review (30 Minuten)

---

## Option B: WordPress Landing-Page

## Wann sinnvoll
- Wenn ihr haeufig ohne Entwickler Texte, Seiten oder Blog-Artikel pflegen wollt
- Wenn Marketing-Team ein visuelles CMS braucht

## Aufwand / Betrieb
- Initial: ca. 1 bis 2 Tage (inkl. Hardening + Theme + Plugins)
- Laufender Aufwand: mittel (Core/Plugin/Theme Updates, Backups, Security)
- Monatliche Zusatzkosten: meist 0 bis gering, aber mehr Wartungszeit

## Umsetzungsschritte
1. Pakete installieren
```bash
sudo apt update
sudo apt install -y nginx mysql-server php-fpm php-mysql php-curl php-xml php-mbstring php-zip php-gd unzip
```

2. Datenbank anlegen
```bash
sudo mysql -e "CREATE DATABASE fabu_wp DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
sudo mysql -e "CREATE USER 'fabu_wp_user'@'localhost' IDENTIFIED BY 'SEHR_STARKES_PASSWORT';"
sudo mysql -e "GRANT ALL PRIVILEGES ON fabu_wp.* TO 'fabu_wp_user'@'localhost'; FLUSH PRIVILEGES;"
```

3. WordPress deployen
```bash
cd /tmp
curl -O https://wordpress.org/latest.tar.gz
tar -xzf latest.tar.gz
sudo mkdir -p /var/www/wordpress-fabu
sudo rsync -av wordpress/ /var/www/wordpress-fabu/
sudo chown -R www-data:www-data /var/www/wordpress-fabu
sudo find /var/www/wordpress-fabu -type d -exec chmod 755 {} \;
sudo find /var/www/wordpress-fabu -type f -exec chmod 644 {} \;
```

4. Nginx fuer WordPress
Datei: `/etc/nginx/sites-available/fabu-wp`
```nginx
server {
    listen 80;
    server_name fabu-online.de www.fabu-online.de;

    root /var/www/wordpress-fabu;
    index index.php index.html;

    location / {
        try_files $uri $uri/ /index.php?$args;
    }

    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/php8.3-fpm.sock;
    }

    location ~ /\.ht {
        deny all;
    }
}
```

Aktivieren:
```bash
sudo ln -s /etc/nginx/sites-available/fabu-wp /etc/nginx/sites-enabled/fabu-wp
sudo nginx -t
sudo systemctl reload nginx
```

5. HTTPS aktivieren
```bash
sudo certbot --nginx -d fabu-online.de -d www.fabu-online.de
```

6. Sicherheits-Basics (Pflicht)
- Nur noetige Plugins installieren
- Auto-Updates fuer Security einschalten
- Login-Rate-Limit (z. B. Fail2Ban oder Plugin)
- XML-RPC deaktivieren, wenn nicht benoetigt
- Tägliche Datenbank-Backups + woechentliche Restore-Probe

## Risiken und Gegenmassnahmen
- Risiko: Plugin-Sicherheitsluecken
  - Gegenmassnahme: minimale Plugin-Anzahl, feste Update-Routine
- Risiko: Performance sinkt durch Theme/Plugins
  - Gegenmassnahme: Caching + schlankes Theme + Bildoptimierung

---

## Entscheidungsmatrix
- Wenig Aenderungen, Fokus auf Geschwindigkeit/Sicherheit: **Option A (statisch)**
- Haeufiges Marketing-Editing durch Nicht-Entwickler: **Option B (WordPress)**

Fuer FaBu aktuell: **Option A (statisch) zuerst**. Bei spaeterem Blog-Bedarf kann WordPress auf `blog.fabu-online.de` ergaenzt werden.

---

## Konkreter Rollout-Vorschlag fuer FaBu
1. Landing statisch auf `fabu-online.de` + `www.fabu-online.de`
2. App auf `app.fabu-online.de`
3. Einheitliches Branding und klare CTA: "Demo anfragen", "Jetzt einloggen"
4. Messung mit Plausible oder GA4 (Pageviews + CTA-Klicks)
5. Nach 4 bis 8 Wochen bewerten:
- Falls Content-Marketing wichtig wird: zusaetzlich WordPress auf `blog.fabu-online.de`

---

## Abnahmekriterien
- HTTPS aktiv fuer alle Domains
- Landing getrennt von App ausgerollt
- 404/500-Seiten verifiziert
- Lighthouse Mobile >= 90 fuer Performance/Best Practices/SEO
- Kontaktformular oder CTA funktioniert und leitet korrekt weiter
