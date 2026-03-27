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
npm ci
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
