# FaBu Landing (Astro)

Statisches Landing-Page-Projekt fuer `fabu-online.de`.

## Lokal starten
```bash
cd landing
npm install
npm run dev
```

## Build
```bash
cd landing
npm run build
```

Build-Output: `landing/dist`

## Deployment (Server)
```bash
cd /home/deploy/FaBu/landing
npm install
npm run build
sudo rsync -av --delete dist/ /var/www/html/fabu-landing/
sudo chown -R www-data:www-data /var/www/html/fabu-landing
```

## Nginx
Root fuer Landing:
- `/var/www/html/fabu-landing`

Domain empfohlen:
- `fabu-online.de`
- `www.fabu-online.de`

App separat:
- `app.fabu-online.de`

## Wichtiger Nginx-Hinweis

Die Landing ist eine statische Astro-Site mit echten Seiten unter `/impressum/` und `/datenschutz/`.
Verwende deshalb in Nginx keine SPA-Fallback-Regel auf `/index.html`.

Korrekt ist:
```nginx
location / {
	try_files $uri $uri/ $uri.html =404;
}
```
