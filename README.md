# FaBu - Fahrzeugbuchungs-App

Eine moderne Full-Stack-Anwendung fuer die Verwaltung von Fahrzeugreservierungen, entwickelt mit Node.js (Express + SQLite/PostgreSQL), React (Vite + Tailwind CSS) und React Native (Expo) fuer Mobile.

## Status

- **Seit 2026-10-24 auf dem Hetzner-Server `franksagent` (78.46.70.46)**, umgezogen
  vom Hostinger-VPS. Betrieb als Docker-Compose-Projekt unter `/opt/fabu` hinter
  Traefik. Hergang, Entscheidungen und Fallstricke: `MIGRATION_HOSTINGER_TO_HETZNER.md`
- Produktion aktiv auf PostgreSQL (eigener Container, Volume `fabu_postgres_data`)
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

### Produktions-Deployment (App + Landing in einem Schritt)
```bash
# Auf dem DEV-RECHNER, aus dem Repo-Root — nicht auf dem Server:
./infra/scripts/deploy.sh

# Testen: https://app.fabu-online.de und https://fabu-online.de
```

Das Skript überträgt den aktuellen Commit per `git archive` über SSH nach
`/opt/fabu`, baut dort die drei Images und startet die Container neu. Es gibt
keinen Git-Checkout mehr auf dem Server, der aus dem Tritt kommen könnte.

Landing und App werden zusammen ausgerollt — beide sind Targets desselben
Dockerfiles. Ein separates `deploy-landing.sh` braucht es nicht mehr.

**Stolperfalle beim Health-Check:** Er fragt `https://app.fabu-online.de` ab,
also den öffentlichen Namen. Hält der Resolver des Dev-Rechners noch eine alte
Adresse, meldet er 502, obwohl auf dem Server alles läuft. Im Zweifel
gegenprüfen:
```bash
curl -s -o /dev/null -w '%{http_code} via %{remote_ip}\n' https://app.fabu-online.de/api/version
```

Hinweis zu SQLite: Produktion läuft auf PostgreSQL, der SQLite-Pfad existiert
nur noch für die lokale Entwicklung. `better-sqlite3` bleibt trotzdem
Abhängigkeit des Produktions-Images, weil `backend/src/db/client.js` es
statisch auf Modulebene importiert — benutzt wird es dort nie.

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
1. Commit und Push
2. `./infra/scripts/deploy.sh` vom Dev-Rechner
3. Testen: `https://app.fabu-online.de`

### 3. Wartung

Alle Befehle auf dem Server als User `frank` (nicht `root`), aus `/opt/fabu`.
Abkürzung, die in den folgenden Zeilen benutzt wird:

```bash
COMPOSE="docker compose -f infra/docker-compose.prod.yml --env-file .env.production -p fabu"
```

- Status: `$COMPOSE ps`
- Backend neu starten: `$COMPOSE restart api worker`
- Logs: `docker logs fabu-api --tail 50`, ebenso `fabu-worker`, `fabu-web`, `fabu-landing`
- Datenbank: `$COMPOSE exec postgres psql -U fabu -d fabu`
- Kein nginx, kein Certbot, kein pm2 mehr auf dem Host — Traefik
  (`/opt/traefik`) terminiert TLS und routet nach den Labels im Compose-File.
- Zertifikat nach gescheitertem ACME neu anfordern:
  `$COMPOSE up -d --force-recreate web` — ein `docker restart` genügt **nicht**,
  Traefik fordert erst bei geänderter Service-Identität zeitnah neu an. Traefik
  selbst nicht neu starten, das träfe alle Seiten des Servers.

### 4. Backup und Wiederherstellung

- Nächtlich um 05:00 per Cron (User `frank`): Datenbank, Fahrzeugbilder und
  — sobald der GPG-Key vorliegt — die verschlüsselte `.env.production`, offsite
  auf die Hetzner Storage Box.
- Um 08:55 prüft ein Wächter **am Ziel** nach und mailt bei Problemen; montags
  kommt eine „Backup OK"-Mail, damit ihr Ausbleiben selbst eine Warnung ist.
- Wiederherstellung Schritt für Schritt: `infra/RESTORE.md`

## 🛠️ Skripte

- `local-dev.sh`: Lokales Setup (Dependencies installieren)
- `infra/scripts/deploy.sh`: Prod-Deployment vom Dev-Rechner
- `infra/scripts/backup.sh`: Nächtliches Offsite-Backup (läuft auf dem Server per Cron)
- `infra/scripts/check-backup-freshness.sh`: Backup-Wächter (prüft am Ziel, mailt bei Problemen)
- `infra/docker-compose.local-test.yml`: Produktions-Stack lokal probelaufen lassen,
  inklusive eigenem Traefik — prüft die Routing-Labels, die ein reiner
  `docker build` nicht berührt

**Veraltet seit dem Umzug** (gelten für das alte Hostinger-Setup mit nginx,
Certbot und pm2 und funktionieren hier nicht mehr): `deploy-prod.sh`,
`deploy-landing.sh`, `install-server.sh`, `setup-postgres.sh`, `setup-user.sh`,
`ensure-autostart.sh`, `health-check.sh`, `update-app.sh`,
`nginx-config-*-example`, `NGINX_SETUP_DOCS.md`, `PRODUCTION_AUTOSTART_GUIDE.md`,
`SERVER_DEPLOYMENT_CHECKLIST.md`.

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

# Prod-Status prüfen (inkl. der Gegenstelle, damit ein DNS-Cache nicht täuscht)
curl -s -o /dev/null -w '%{http_code} via %{remote_ip}\n' https://app.fabu-online.de/api/version
ssh hetzner-sportfoto 'su - frank -c "cd /opt/fabu && docker compose -f infra/docker-compose.prod.yml -p fabu ps"'

# Prod-Logs prüfen
ssh hetzner-sportfoto 'docker logs fabu-api --tail 20; docker logs fabu-worker --tail 10'
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
├── infra/            # Deployment (seit dem Umzug auf Hetzner)
│   ├── docker/       # Dockerfile (Targets api/web/landing) + nginx-Configs
│   ├── docker-compose.prod.yml      # Produktion hinter Traefik
│   ├── docker-compose.local-test.yml# Probelauf auf dem Dev-Rechner
│   ├── scripts/      # deploy.sh, backup.sh, check-backup-freshness.sh
│   └── RESTORE.md    # Wiederherstellung aus dem Offsite-Backup
├── local-dev.sh      # Lokales Setup
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