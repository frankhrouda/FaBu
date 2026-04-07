# FaBu - Fahrzeugbuchungs-App

Eine moderne Full-Stack-Anwendung fuer die Verwaltung von Fahrzeugreservierungen, entwickelt mit Node.js (Express + SQLite/PostgreSQL), React (Vite + Tailwind CSS) und React Native (Expo) fuer Mobile.

## Status

- Produktion aktiv auf PostgreSQL
- Web-App aktiv unter `https://app.fabu-online.de`
- Landing-Page aktiv unter `https://fabu-online.de`
- Multi-Tenant-Isolation ist implementiert und produktiv
- Separate Superadmin-Mandantenverwaltung vorhanden unter `/admin/tenants`
- Tenant-Name wird im Header angezeigt: `Mandant: [Name]`

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

### Mobile App (React Native + Expo)
```bash
# Einmalig installieren
cd mobile && npm install

# Beispiel fuer Android Emulator + lokales Backend
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:3001/api npm run android

# Alternativ vom Repo-Root
npm run dev:mobile
```

Hinweis: Die Mobile-App wird in diesem Repo bewusst separat unter `mobile/` verwaltet und nicht ueber npm workspaces gestartet.

#### Android Voraussetzungen (Ubuntu)

Wenn Android Studio und SDK installiert sind, aber `npm run android` Fehler wie
`Failed to resolve the Android SDK path` oder `spawn adb ENOENT` zeigt,
fehlen meist Umgebungsvariablen.

In `~/.bashrc` eintragen:

```bash
export ANDROID_HOME="$HOME/Android"
export ANDROID_SDK_ROOT="$HOME/Android"
export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/cmdline-tools/bin"
```

Dann neu laden:

```bash
source ~/.bashrc
```

Pruefen:

```bash
adb version
adb devices
```

Wenn ein Emulator laeuft, sollte dort z.B. `emulator-5554   device` erscheinen.

### Produktions-Deployment (App)
```bash
# Auf dem VPS (als deploy-User):
ssh deploy@187.124.170.226
cd /home/deploy/FaBu
./deploy-prod.sh

# Testen: https://app.fabu-online.de
```

### Landing-Page Deployment (separat)
```bash
# Auf dem VPS (als deploy-User):
ssh deploy@187.124.170.226
cd /home/deploy/FaBu
./deploy-landing.sh

# Testen: https://fabu-online.de
```

Wichtig bei der Umstellung von SQLite auf PostgreSQL in Produktion:
- `backend/.env` auf dem Server muss `DB_CLIENT=postgres` und eine gueltige `DATABASE_URL` enthalten.
- `deploy-prod.sh` erstellt vor der ersten Umstellung automatisch ein SQLite-Backup unter `backend/data/sqlite-backups/`.
- Danach wird dieses Backup idempotent in PostgreSQL eingespielt.
- Nach erfolgreicher Erstmigration wird eine Marker-Datei gesetzt, damit Folge-Deploys nicht erneut migrieren.
- Fuer eine erzwungene Wiederholung: `FORCE_SQLITE_MIGRATION=1 ./deploy-prod.sh`

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
2. PostgreSQL bereitstellen, falls noch nicht geschehen: `./setup-postgres.sh`
3. In `backend/.env` setzen: `DB_CLIENT=postgres` und `DATABASE_URL=...`
4. Deploy-Skript: `cd /home/deploy/FaBu && ./deploy-prod.sh`
5. Testen: `https://app.fabu-online.de`

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
- `setup-postgres.sh`: PostgreSQL einrichten (lokal oder auf dem Server)
- `update-app.sh`: Einfaches Update (veraltet, verwende `deploy-prod.sh`)

### Neue Features
- Logout-Button in der Kopfzeile (oben rechts). Direkt ausloggen und zur Login-Seite zurück.
- Kalenderansicht für Fahrzeugverfügbarkeiten unter `/calendar`.
- Visuelles Zeit-Gitter (8:00–19:00) mit gebucht/frei-Status.
- Admin kann Fahrzeuge filtern: Alle/Einzelne, aktive/inaktive.
- Admin/Normalnutzer sehen passende Buchungen (je nach Rolle).
- Multi-Tenant-Rechtekonzept mit Tenant-gebundenen Admins.
- Superadmin kann separate Mandantenverwaltung unter `/admin/tenants` verwenden.
- Superadmin kann Mandanten umbenennen, Mitglieder verwalten und Benutzer direkt im Mandanten anlegen.
- Kennzeichen sind tenant-spezifisch eindeutig, nicht global über alle Mandanten.

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
│   │   ├── db/       # Datenbankanbindung fuer SQLite/PostgreSQL
│   │   ├── routes/   # API-Routen
│   │   └── index.js  # Server-Start
│   ├── data/         # SQLite-Datei und Backups fuer Migrationen
│   └── scripts/      # Datenbank-Migrationsskripte
│   └── package.json
├── frontend/         # React Vite App
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   └── App.jsx
│   └── package.json
├── mobile/           # React Native Expo App
│   ├── src/
│   │   ├── screens/
│   │   ├── auth/
│   │   ├── api/
│   │   └── navigation/
│   └── package.json
├── setup-user.sh     # Server-User-Setup
├── install-server.sh # Server-Software-Installation
├── local-dev.sh      # Lokales Setup
├── deploy-prod.sh    # Prod-Deployment
└── README.md         # Diese Datei
```

## 📘 API-Dokumentation

- API-Vertrag fuer Web- und Mobile-Clients: `backend/API.md`
- Android-Kotlin Referenz (Retrofit, Auth-Interceptor, Token-Storage): `backend/ANDROID_CLIENT_REFERENCE.md`
- Android Screen-by-Screen Backlog (Implementierungsreihenfolge): `backend/ANDROID_SCREEN_BACKLOG.md`
- Vollstaendiges Kotlin Retrofit-Template (alle Endpunkte + DTOs): `backend/android-template/FabuApiTemplate.kt`
- React Native Expo Setup (MVP mit Login/Fahrzeuge/Reservierung): `mobile/README.md`
- E-Mail-Konzeption (Postausgang, Outbox, Worker, Sicherheit, Kostenstrategie): `EMAIL_DELIVERY_CONCEPT.md`

## 🔐 Sicherheit

- Root-Login deaktiviert
- SSH-Key-Authentifizierung
- UFW Firewall aktiv
- HTTPS via Let's Encrypt
- AppArmor für Nginx (empfohlen)

### Backend-Sicherheitskonfiguration (wichtig)

Das Backend erwartet ab sofort eine gesetzte Umgebungsvariable `JWT_SECRET`.
Ohne `JWT_SECRET` startet der Server nicht.

#### Lokal starten
```bash
cd backend
# Option A (empfohlen): backend/.env mit JWT_SECRET anlegen, dann einfach:
cp .env.example .env
npm run dev

# Option B: Secret inline setzen
JWT_SECRET="dev-strong-secret" npm run dev
```

#### Produktion (Beispiel)
Setze `JWT_SECRET` in der Prozessumgebung (z.B. PM2 Ecosystem, Systemd, CI/CD Secret Store).

Wenn Produktion auf PostgreSQL laufen soll, zusaetzlich in `backend/.env` setzen:
```bash
DB_CLIENT=postgres
DATABASE_URL=postgresql://USER:PASS@localhost:5432/fabu
```

Bestehende SQLite-Daten einmalig uebernehmen:
```bash
cd backend
npm run migrate:sqlite-to-postgres
```

Optional kann eine andere SQLite-Quelle angegeben werden:
```bash
cd backend
SQLITE_DB_PATH=/pfad/zur/fabu-backup.db npm run migrate:sqlite-to-postgres
```

Hinweis zum aktuellen Produktionsstand:
- PostgreSQL ist produktiv aktiv.
- Bei Legacy-Installationen wurden nachträgliche Schema-Fixes für `vehicles.tenant_id` und tenant-spezifische Kennzeichen-Indizes benötigt.
- Nach Backend-Änderungen in Produktion immer `pm2 restart fabu-backend` ausführen und den Login-Endpunkt kurz prüfen.

Zusätzlich sind folgende Schutzmechanismen aktiv:
- `helmet` für Security-Header
- Rate-Limits auf Auth-Endpunkten:
  - `POST /api/auth/login`: max. 10 Requests pro 15 Minuten
  - `POST /api/auth/register`: max. 10 Requests pro 15 Minuten
- Allgemeines API-Limit auf `/api`: max. 300 Requests pro 15 Minuten

Bei Überschreitung antwortet die API mit einem JSON-Fehlerobjekt:
```json
{ "error": "Zu viele Anfragen. Bitte spaeter erneut versuchen." }
```

## 📞 Support

Bei Problemen:
1. Logs prüfen (siehe oben)
2. GitHub-Issues erstellen
3. Lokale Reproduktion testen

## 📝 Lizenz

MIT License