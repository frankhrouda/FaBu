# FaBu - Fahrzeugbuchungs-App

Eine moderne Full-Stack-Anwendung für die Verwaltung von Fahrzeugreservierungen, entwickelt mit Node.js (Express + SQLite) und React (Vite + Tailwind CSS).

## 🚀 Schnellstart

### Lokales Setup
```bash
# Abhängigkeiten installieren
./local-dev.sh

# In zwei Terminals starten:
# Terminal A: cd backend && npm run dev
# Terminal B: cd frontend && npm run dev

# Testen:
# Frontend: http://localhost:5173
# Backend: http://localhost:3001
```

### Produktions-Deployment
```bash
# Auf dem VPS (als deploy-User):
ssh deploy@187.124.170.226
cd /home/deploy/FaBu
./deploy-prod.sh

# Testen: https://fabu-online.de
```

## 📋 Workflow: Lokale Entwicklung → Produktion

### 1. Lokale Änderungen
1. Code bearbeiten (z.B. in VS Code)
2. Lokales Setup: `./local-dev.sh`
3. Starten:
   - Backend: `cd backend && npm run dev`
   - Frontend: `cd frontend && npm run dev`
4. Testen: `http://localhost:5173`
5. Commit & Push: `git add . && git commit -m "..." && git push`

### 2. Produktions-Deployment
1. SSH auf VPS: `ssh deploy@187.124.170.226`
2. Deploy-Skript: `cd /home/deploy/FaBu && ./deploy-prod.sh`
3. Testen: `https://fabu-online.de`

### 3. Wartung
- Backend neu starten: `pm2 restart fabu-backend`
- Nginx reload: `sudo nginx -t && sudo systemctl reload nginx`
- Logs prüfen:
  - Nginx: `sudo tail -n 20 /var/log/nginx/error.log`
  - Backend: `pm2 logs fabu-backend`

## 🛠️ Skripte

- `local-dev.sh`: Lokales Setup (Dependencies installieren)
- `deploy-prod.sh`: Vollständiges Prod-Deployment (Pull, Build, Deploy, Restart)
- `install-server.sh`: Server-Setup (Node.js, SQLite, Nginx, etc.)
- `update-app.sh`: Einfaches Update (veraltet, verwende `deploy-prod.sh`)

### Neue Features
- Logout-Button in der Kopfzeile (oben rechts). Direkt ausloggen und zur Login-Seite zurück.
- Kalenderansicht für Fahrzeugverfügbarkeiten unter `/calendar`.
- Visuelles Zeit-Gitter (8:00–19:00) mit gebucht/frei-Status.
- Admin kann Fahrzeuge filtern: Alle/Einzelne, aktive/inaktive.
- Admin/Normalnutzer sehen passende Buchungen (je nach Rolle).

## 🔍 One-Liner für schnellen Desk-Check

```bash
# Lokaler Build-Test
cd frontend && npm run build && serve -s dist

# Prod-Status prüfen
ssh deploy@187.124.170.226 'pm2 status && sudo systemctl status nginx'

# Prod-Logs prüfen
ssh deploy@187.124.170.226 'pm2 logs fabu-backend --lines 10 && sudo tail -n 10 /var/log/nginx/error.log'
```

## 📁 Projektstruktur

```
FaBu/
├── backend/          # Node.js Express API
│   ├── src/
│   │   ├── db/       # SQLite Datenbank
│   │   ├── routes/   # API-Routen
│   │   └── index.js  # Server-Start
│   └── package.json
├── frontend/         # React Vite App
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   └── App.jsx
│   └── package.json
├── setup-user.sh     # Server-User-Setup
├── install-server.sh # Server-Software-Installation
├── local-dev.sh      # Lokales Setup
├── deploy-prod.sh    # Prod-Deployment
└── README.md         # Diese Datei
```

## 🔐 Sicherheit

- Root-Login deaktiviert
- SSH-Key-Authentifizierung
- UFW Firewall aktiv
- HTTPS via Let's Encrypt
- AppArmor für Nginx (empfohlen)

## 📞 Support

Bei Problemen:
1. Logs prüfen (siehe oben)
2. GitHub-Issues erstellen
3. Lokale Reproduktion testen

## 📝 Lizenz

MIT License