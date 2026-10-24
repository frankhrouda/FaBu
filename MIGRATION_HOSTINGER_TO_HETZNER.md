# Umzug FaBu: Hostinger-VPS → Hetzner „franksagent"

Stand: 2026-10-24. Grundlage: Inspektion beider Server, der DNS-Zone und des Repos
(keine Annahmen — alle Zahlen unten sind gemessen).

Zielbild in einem Satz: FaBu läuft als Docker-Compose-Projekt unter `/opt/fabu` hinter
dem bestehenden Traefik auf `franksagent`, mit eigenem Postgres-Container, eigenem
Upload-Volume, nächtlichem Offsite-Backup und Backup-Wächter — genau nach dem Muster,
das `sportfoto-hrouda`, `meinekladde` und `selbstanker` dort schon benutzen.

---

## 1. Ist-Zustand (gemessen)

### Hostinger-VPS (`fabu-vps`, `srv1509746`, 187.124.170.226, Ubuntu 24.04)

| Was | Details |
|---|---|
| FaBu Backend | pm2 `fabu-backend`, Node 20.20.2, Port 3001 |
| FaBu Worker | pm2 `fabu-reminder-worker` (Mail-Erinnerungen, Poll 60 s) |
| FaBu Frontend | React/Vite-Build statisch in `/var/www/html/fabu` |
| FaBu Landing | Astro-Build statisch in `/var/www/html/fabu-landing` |
| Datenbank | **Host**-Postgres 16.15, DB `fabu`, **8,5 MB**, 9 Tabellen |
| Datenbestand | 9 Benutzer, 5 Fahrzeuge, 30 Reservierungen, 2 Mandanten |
| Uploads | `/home/deploy/FaBu/backend/data/uploads` — **4,9 MB** |
| Secrets | `backend/.env`: `JWT_SECRET`, `DB_CLIENT`, `DATABASE_URL`, `RESEND_API_KEY`, `MAIL_FROM`, `APP_FRONTEND_URL`, `NODE_ENV` |
| TLS | nginx + Certbot pro Site |

**Die Datenmenge ist winzig (13 MB gesamt).** Der Umzug ist deshalb technisch einfach;
der Aufwand liegt praktisch komplett in DNS, Mail-Records und Containerisierung.

### Auf demselben VPS laufen aber noch andere Dinge

| Site | Status | Konsequenz |
|---|---|---|
| `omafun.fabu-online.de` | **live**, pm2 `omafun-web` + `omafun-worker`, Port 3010 | Hängt an der Domain `fabu-online.de`, die wir umziehen → muss im Konzept mitbedacht werden (siehe §4) |
| `lustiges-tabellenspiel.de` (+ `www`) | **live** (A-Record zeigt auf den VPS) | Eigene Domain, eigener Umzug — blockiert aber die VPS-Kündigung |
| `ai.franksagent.de` | nginx-Site vorhanden, **DNS zeigt längst auf Hetzner** | Altlast, kein Umzug nötig |
| `hermes.franksagent.de` | dito | Altlast, kein Umzug nötig |

→ **Der VPS kann nicht gekündigt werden, solange `omafun` und
`lustiges-tabellenspiel.de` dort laufen.** FaBu allein freizuräumen reicht nicht.
Das ist der wichtigste Punkt, der über den eigentlichen Auftrag hinausgeht.

### Hetzner `franksagent` (78.46.70.46, IPv6 `2a01:4f8:120:3143::2`, Ubuntu 26.04)

| Was | Details |
|---|---|
| Reverse Proxy | Traefik v3.7, Docker-Provider, externes Netz `web`, Let's Encrypt via **HTTP-Challenge** |
| Muster | je App `/opt/<app>` (User `frank`), `infra/docker-compose.prod.yml`, eigener Postgres-Container |
| Platz | 272 GB frei auf `/` (SSD-RAID1), 1,7 TB frei auf `/data` (HDD-RAID1) |
| RAM | 62 GB, aktuell 3,9 GB belegt — FaBu fällt nicht auf |
| Backups | Cron von **`frank`** → Hetzner Storage Box `u595016`, rclone-Remote `offsite` |
| Backup-Wächter | je Projekt `check-backup-freshness.sh`, Mail über Resend, Creds in `~/.config/backup-alert.env` |
| Belegte Backup-Slots | 03:00 sportfoto · 03:15 wordpress · 03:30 cv · 04:00 klarliste · 04:30 meinekladde |
| Kein | nginx, kein Certbot, kein pm2 auf dem Host — alles Container |

### DNS `fabu-online.de`

Nameserver: `ns1.dns-parking.com` / `ns2.dns-parking.com` → **Zone liegt bei Hostinger**,
Registrar ist Hostinger. Aktuelle Records (per `dig` ermittelt):

| Name | Typ | Wert |
|---|---|---|
| `fabu-online.de` | A | 187.124.170.226 |
| `www.fabu-online.de` | CNAME | `fabu-online.de.` |
| `app.fabu-online.de` | A | 187.124.170.226 |
| `omafun.fabu-online.de` | A | 187.124.170.226 |
| `send.mail.fabu-online.de` | MX 10 | `feedback-smtp.eu-west-1.amazonses.com.` |
| `send.mail.fabu-online.de` | TXT | `v=spf1 include:amazonses.com ~all` |
| `resend._domainkey.mail.fabu-online.de` | TXT | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDNRz/ZXIE+rmSstFWrBBtNQG7dQCuqvGCJUMuvDiFcj8G0XGTUSJ7Z20Uo6MKBUTs29vWqX1gZzHUzPMKsTC6Wp1WCVz8ytr4io2LJDcm6wO6nKwLSSypLt6iZhcLa+4idRMkleppKhHqzWaPv+YnHCpXbV1lEUBe5WniN7nLexwIDAQAB` |

Kein AAAA, kein CAA, kein DMARC, keine Apex-MX. **`MAIL_FROM` nutzt
`mail.fabu-online.de`** — die drei Resend-Records sind also betriebsnotwendig
(Passwort-Reset-, Einladungs- und Erinnerungsmails).

⚠️ Ein Zonentransfer (AXFR) ist bei Hostinger gesperrt. Die Liste oben enthält alles,
was ich *erraten und abfragen* konnte. Es kann weitere Records geben, die ich per `dig`
nicht finden kann (ein Name, den man nicht kennt, ist nicht abfragbar). Deshalb ist der
Zonen-Export aus dem hPanel eine deiner Aufgaben (§5, D-1).

---

## 2. Soll-Architektur auf `franksagent`

```
                    Traefik :80/:443  (TLS, Let's Encrypt HTTP-01)
                             │
     ┌───────────────────────┼────────────────────────────┐
     │                       │                            │
 Host(fabu-online.de)   Host(app.fabu-online.de)   Host(app.…) &&
 || Host(www.…)         Prio 1                     PathPrefix(/api|/uploads)
     │                       │                     Prio 10
     ▼                       ▼                            ▼
┌──────────────┐      ┌──────────────┐          ┌──────────────────┐
│ fabu-landing │      │  fabu-web    │          │    fabu-api      │
│ nginx:alpine │      │ nginx:alpine │          │ node:20-alpine   │
│ Astro-dist   │      │ Vite-dist    │          │ Express :3001    │
└──────────────┘      └──────────────┘          └────────┬─────────┘
                                                          │ Netz „internal"
                                   ┌──────────────────────┼─────────────┐
                                   ▼                      ▼             │
                         ┌──────────────────┐   ┌──────────────────┐    │
                         │  fabu-postgres   │   │   fabu-worker    │────┘
                         │ postgres:16-     │   │ reminder-worker  │
                         │ alpine + Volume  │   │ (gleiches Image) │
                         └──────────────────┘   └──────────────────┘
                                   ▲
                         Volume fabu_uploads → /app/backend/data/uploads
```

Begründungen für die Entscheidungen, die ich getroffen habe:

- **Pfad-Split auf `app.fabu-online.de`** statt eigener API-Subdomain: so bleibt alles
  same-origin wie heute. Das Frontend ruft bereits relative `/api`-Pfade auf
  (`frontend/vite.config.js`), also ist **kein einziger Code-Change am Frontend nötig**.
  Genau dieses Muster nutzt `selbstanker` auf dem Server schon.
- **Zwei nginx-Container für die statischen Teile** statt „Express serviert auch das
  Frontend": kein Code-Change am Backend, und Landing (Astro, `try_files $uri.html`)
  und App (SPA, Fallback auf `/index.html`) brauchen unterschiedliche Fallback-Regeln.
- **Eigener Postgres-Container** statt Host-Postgres: Server-Konvention, und die
  Datenbank zieht beim nächsten Umzug mit dem Projekt mit.
- **`/uploads` auch per Traefik auf die API**: Die Bilder liegen hinter
  `express.static`, nicht im Web-Root. Reihenfolge-Falle aus `NGINX_SETUP_DOCS.md`
  (Caching-Regex frisst `/api/uploads/*.jpg`) entfällt bei Traefik, weil die Prio
  explizit gesetzt wird.
- **Worker als eigener Service, gleiches Image**: entspricht `fabu-reminder-worker`
  heute und `sportfoto`-Worker dort.
- **Uploads in ein Docker-Volume**, nicht nach `/data`: 4,9 MB, kein Bild-Archiv —
  `/data` (HDD-RAID1) ist für große Fotobestände gedacht.

Healthcheck der API: `GET /api/version` existiert bereits (`backend/src/app.js:95`),
muss nichts gebaut werden.

---

## 3. Die drei Grundsatzentscheidungen

**Entschieden am 2026-10-24:**

| | Entscheidung | Folge |
|---|---|---|
| E-1 | **Registrierung komplett zu Hetzner** | Registrar-Transfer als eigener Schritt *nach* dem Server-Umzug (D-15) |
| E-2 | **DNS-API-Token kommt** | Ich übernehme die komplette DNS-Arbeit; dir bleibt nur die Nameserver-Umstellung im hPanel (D-6). Anleitung: §3a |
| E-3 | **VPS wird gelöscht**, Abschalten unnötig | Phase 6 reduziert sich auf „letztes Vollbackup, dann weg" — aber erst, wenn `omafun` und `lustiges-tabellenspiel.de` umgezogen sind (§12) |

Die Begründungen zu den Optionen bleiben unten stehen, weil sie den Plan erklären.

### E-1: Wohin mit der Domain-**Registrierung** von `fabu-online.de`?

| Option | Bedeutung | Bewertung |
|---|---|---|
| **A: DNS zu Hetzner, Registrierung bleibt bei Hostinger** | Nur Nameserver auf die Hetzner-Zone umstellen | Schnell, risikoarm, aber du bleibst Hostinger-Kunde → widerspricht „Hostinger komplett abgeben" |
| **B: Komplett zu Hetzner transferieren** (empfohlen) | AuthInfo-Code bei Hostinger ziehen, Domain über Hetzners Registration Robot / konsoleH übernehmen | Alles bei einem Anbieter, wie deine anderen Domains (`sportfoto-hrouda.de`, `meinekladde.de`, `franksagent.de` laufen schon über Hetzner-DNS). Dauer 1–2 Werktage, einmalige Registrierungskosten |
| C: Zu einem Domain-Spezialisten (INWX, Netcup) | eigener Registrar | Mehr Komfort bei DNS/Handles, aber ein dritter Anbieter mehr |

**Wichtig:** Der Registrar-Wechsel (B) und der Server-Umzug sind *unabhängig* und
sollen **nicht gleichzeitig** passieren. Reihenfolge: erst DNS zu Hetzner und FaBu
live (§6), dann in Ruhe der Registrar-Transfer. Ein Transfer ändert die Nameserver
nicht, wenn du beim neuen Registrar dieselben einträgst.

Nebenbedingung: .de-AuthInfo-Codes sind 30 Tage gültig, und eine Domain ist erst
60 Tage nach letzter Registrierung/Transfer transferierbar.

### E-2: Gibst du mir einen Hetzner-DNS-API-Token?

Du hast gesagt, du willst nur machen, was ich wirklich nicht kann. **DNS ist der große
Brocken, der davon abhängt.**

- **Mit Token** (`console.hetzner.com`, Anleitung in §3a — einmalig, projektgebunden):
  Ich lege die Zone an, trage alle Records inkl. der drei Resend-Einträge an, entferne
  den gefährlichen Default-AAAA-Record und flippe später die A-Records. Deine Arbeit
  reduziert sich auf: Nameserver bei Hostinger umstellen + Zonen-Export.
- **Ohne Token**: Du klickst ~8 Records in der Hetzner-DNS-Konsole. Ich liefere die
  Tabelle mit exakten Werten (steht unten in §6 schon fertig).

Empfehlung: Token. Er ist jederzeit widerrufbar.

#### §3a — So erzeugst du den Token (D-3)

⚠️ **Die alte DNS-Konsole `dns.hetzner.com` ist abgeschaltet** (Mai 2026,
`dns.hetzner.com` leitet auf `console.hetzner.com` um). Tokens aus der alten
Konsole funktionieren **nicht** weiter, und die alte API
(`dns.hetzner.com/api/v1/...`) antwortet mit 401. Jede Anleitung, die auf
„dns.hetzner.com → API-Tokens" verweist, ist veraltet. DNS ist jetzt Teil der
Cloud-API, und der Zugriff haengt am **API-Token des Projekts**, in dem die
Zonen liegen.

**Klickpfad:**

1. `https://console.hetzner.com` oeffnen und einloggen
2. **Projekt auswaehlen, in dem die DNS-Zonen liegen.** Das ist der Schritt, an
   dem es schiefgeht: beim automatischen Umzug legt Hetzner die Zonen haeufig
   in ein eigenes Projekt, das dann etwa **„DNS Migrated"** heisst — nicht in
   das Projekt, das man gewohnheitsmaessig anklickt. Im richtigen Projekt
   stehen unter **DNS** die Zonen `sportfoto-hrouda.de`, `meinekladde.de`,
   `franksagent.de`.
3. Links im Menue **„Sicherheit"** (Security)
4. Oben den Tab **„API-Tokens"**
5. **„API-Token hinzufuegen"**, Name z. B. `fabu-migration-2026-10`
6. Berechtigung **„Read & Write"** — mit „Read" kann ich nur lesen, keine
   Records anlegen
7. Token kopieren und mir geben

**Drei Dinge dazu:**

- Der Token wird **nur einmal angezeigt**. Nach dem Schliessen des Fensters ist
  er nicht mehr abrufbar, dann braucht es einen neuen.
- Tokens sind **projektgebunden** und gelten nur fuer *ein* Projekt. Ein Token
  aus dem falschen Projekt sieht die Zonen nicht — der Fehler ist dann
  „zone not found", nicht „unauthorized", was in die Irre fuehrt. Ich pruefe
  deshalb als erstes, ob ich die drei bekannten Zonen auflisten kann, und
  melde sofort zurueck, wenn der Token aus dem falschen Projekt kommt.
- **Reichweite:** Ein Cloud-API-Token kann in *seinem* Projekt alles, nicht nur
  DNS — in einem Projekt mit Servern also auch Server anlegen oder loeschen.
  Feiner einstellen laesst sich das nicht. Zwei Dinge entschaerfen das hier:
  liegen die Zonen in einem reinen DNS-Projekt (wie dem automatisch
  angelegten), gibt es dort nichts anderes anzufassen. Und `franksagent` ist
  ein **dedizierter Root-Server**, der in Robot verwaltet wird und gar nicht
  in einem Cloud-Projekt liegt — ein Cloud-Token kann ihn nicht beruehren.
  Trotzdem: nach dem Umzug unter demselben Menuepunkt wieder loeschen. Ich
  erinnere daran, wenn wir durch sind.

### E-3: Darf ich auf dem VPS `sudo` nutzen?

Aktuell nicht: `sudo -n` verlangt beim User `deploy` ein Passwort. Betroffen sind nur
die **Abschaltschritte** auf dem Alt-System (nginx-Sites deaktivieren, Postgres-DB
löschen). Das sind 4 Befehle. Alternativen:

- Du führst die 4 Befehle am Ende selbst aus (ich liefere sie als Copy-Paste-Block), **oder**
- du kündigst den VPS sowieso → dann ist Abschalten überflüssig, nur das **Timing**
  muss stimmen (Backup vorher gezogen, §8).

Ohne `sudo` komme ich an pm2 heran (läuft als `deploy`) und an `pg_dump` über die
`DATABASE_URL` — das Wesentliche für die Migration funktioniert also.

**Entschieden: der VPS wird gelöscht.** Damit entfällt das Abschalten. Was dadurch
*wichtiger* wird, nicht unwichtiger: das **letzte Vollbackup vor der Kündigung**
(I-33). Ein gekündigter VPS wird gelöscht, nicht archiviert — danach gibt es kein
Rollback und keinen zweiten Blick in die alte Installation mehr. Ich ziehe deshalb vor
der Kündigung DB, Uploads, `.env` **und** die nginx-Configs aller Sites (auch
`omafun`, `lustiges-tabellenspiel`) offsite, weil die bei den beiden ausstehenden
Umzügen noch als Vorlage dienen.

---

## 4. Die `omafun`-Verzahnung (muss vor dem DNS-Schnitt geklärt sein)

`omafun.fabu-online.de` ist eine **Subdomain der Domain, die wir umziehen**. Sobald die
Nameserver auf Hetzner zeigen, entscheidet die neue Zone über `omafun` mit.

Drei Wege:

1. **Empfohlen — `omafun` bleibt vorerst auf dem VPS:** Die neue Hetzner-Zone bekommt
   `omafun` → A `187.124.170.226`. `omafun` merkt vom Umzug nichts, läuft weiter, und
   wir halten den Scope bei FaBu. Kostet mich einen DNS-Record.
   Das Certbot-Zertifikat auf dem VPS erneuert sich dabei weiterhin problemlos
   (HTTP-01 gegen die unveränderte IP).
2. `omafun` gleich mitumziehen: sauberer Endzustand, aber doppelter Scope und doppeltes
   Risiko in einem Fenster. Als **eigenes Projekt danach**.
3. `omafun` auf eine eigene Domain umstellen: nur sinnvoll, wenn du es sowieso vorhattest.

Ich gehe im Plan von **Weg 1** aus.

---

## 5. Phase 0 — Vorbereitung

### Du (D)

- **D-1 · Zonen-Export aus Hostinger.** hPanel → Domains → `fabu-online.de` → DNS-Zone.
  Screenshot oder CSV-Export der **vollständigen** Record-Liste, und mir hier reinpasten.
  → Grund: AXFR ist gesperrt, ich kann unbekannte Record-Namen nicht erraten. Wenn hier
  z. B. noch ein alter Mail- oder Verifikations-Record steht, fällt er beim Umzug sonst
  lautlos weg.
- **D-2 · Entscheidungen E-1, E-2, E-3** (§3) beantworten.
- **D-3 · DNS-API-Token** in der Hetzner Console erstellen und mir geben —
  Schritt-für-Schritt in **§3a**. (Nicht `dns.hetzner.com`, das ist abgeschaltet.)
- **D-4 · TTL senken (optional, 24 h vorher).** In der Hostinger-Zone TTL der A-Records
  `fabu-online.de` und `app.fabu-online.de` auf 300 s. Macht den Schnitt später
  schneller sichtbar. Nicht kritisch — der Plan in §6 ist so gebaut, dass TTLs kaum
  wehtun.

### Ich (I)

- **I-1 · Secrets sichern.** `backend/.env` vom VPS ziehen und verschlüsselt ablegen.
  `JWT_SECRET` wird **unverändert übernommen** — sonst sind alle aktiven Logins und alle
  offenen Passwort-Reset-Links sofort ungültig.
- **I-2 · Referenz-Dump ziehen.** `pg_dump` der DB `fabu` + `tar` der Uploads, lokal
  ablegen. Das ist das Rollback-Netz, unabhängig von allem Weiteren.
- **I-3 · Platz-/Portcheck auf `franksagent`** (erledigt: reichlich Platz, keine
  Host-Ports nötig, Netz `web` existiert).

---

## 6. Phase 1 — Containerisierung (ich, rein lokal, kein Eingriff in Produktion)

Alles in diesem Abschnitt passiert im Git-Repo. Produktion läuft unberührt weiter.

### Ich (I)

- **I-4 · `infra/docker/Dockerfile`** (Multi-Stage, drei Targets):
  - `api` — `node:20-alpine`, nur `backend/` + Prod-Dependencies, `CMD node src/index.js`.
    `better-sqlite3` braucht Build-Tools in der Builder-Stage (native Extension), auch
    wenn produktiv Postgres läuft — das Modul wird importiert, sobald `db/client.js` lädt.
  - `web` — `node:20-alpine` baut `frontend/` (`npm run build`), Ergebnis in
    `nginx:alpine` mit SPA-Fallback `try_files $uri $uri/ /index.html`.
  - `landing` — baut `landing/` (Astro), Ergebnis in `nginx:alpine` mit
    `try_files $uri $uri/ $uri.html =404` (die Falle aus `NGINX_SETUP_DOCS.md`:
    Astro ist keine SPA, pauschaler `/index.html`-Fallback zerlegt `/impressum`).
  - `client_max_body_size 8m` im `web`-nginx — gleiche Begründung wie in
    `nginx-config-app-example`: Fahrzeugbilder bis 5 MB, Default 1 MB würde mit 413
    abweisen, bevor das Backend etwas sieht. **Zusätzlich** muss das für Traefik
    nicht konfiguriert werden (Traefik hat kein Body-Limit per Default) — aber der
    Upload läuft über den API-Router direkt, nicht über `web`, also ist das Limit dort
    ohnehin unkritisch. Ich setze es trotzdem, damit nichts von der heutigen Konfiguration
    verloren geht.
- **I-5 · `infra/docker-compose.prod.yml`** mit explizitem `name: fabu`.
  ⚠️ Nicht optional: ohne `name:` leitet Compose den Projektnamen aus dem Verzeichnis
  (`infra`) ab — und **jede** andere App auf diesem Server hat ihre Compose-Datei
  ebenfalls in `infra/`. Bei `selbstanker` hat genau das einmal den **laufenden
  Postgres von `sportfoto-hrouda` neu erzeugt** (dokumentiert in dessen Compose-Kopf).
  Services, Volumes (`postgres_data`, `uploads_data`), Netze (`internal`, `web` extern)
  und die Traefik-Labels mit Prio 10 (API) / Prio 1 (SPA) wie im Diagramm in §2.
- **I-6 · `infra/scripts/deploy.sh`** nach dem `meinekladde`-Muster:
  `git archive HEAD | ssh … tar -x` nach `/opt/fabu`, dann
  `docker compose -f infra/docker-compose.prod.yml --env-file .env.production up -d --build`.
  Damit deployst du künftig vom Laptop aus mit einem Befehl, ohne Git auf dem Server.
- **I-7 · `infra/scripts/backup.sh`** — `pg_dump` (gzip) + Uploads-Tar + GPG-verschlüsselte
  `.env.production`, Upload nach `offsite:fabu/{db-dumps,uploads,secrets}`, lokale
  Retention 14 Tage. Aufruf über `bash <pfad>` im Cron, weil ein verlorenes
  Executable-Bit bei `sportfoto-hrouda` schon mal **41 Nächte** Backup-Ausfall verursacht hat.
- **I-8 · `infra/scripts/check-backup-freshness.sh`** — prüft **am Ziel** (Alter ≤ 26 h,
  Mindestgröße), erst Storage-Box-Erreichbarkeit, dann Dateien; mailt über Resend aus
  `~/.config/backup-alert.env`; montags eine „Backup OK"-Mail als Totmannschalter.
- **I-9 · `infra/RESTORE.md`** — Wiederherstellung aus dem Offsite-Backup, inkl. des
  Hinweises, dass der private GPG-Key nie auf den Server gehört.
- **I-10 · `.gitignore`**: `.env.production` ergänzen (steht heute nicht drin — nur `.env`).
- **I-11 · Lokaler Build-Test**: alle drei Images bauen, Compose lokal hochfahren,
  Referenz-Dump aus I-2 einspielen, Login / Fahrzeugliste / Bild-Upload / Kalender
  durchklicken. **Erst wenn das lokal grün ist, wird der Server angefasst.**
- **I-12 · Commit & Push** auf `main`.

### Du (D)

- Nichts. Optional: das Compose-File und den Dockerfile reviewen, bevor ich auf den
  Server gehe.

---

## 7. Phase 2 — Parallelbetrieb auf `franksagent` aufbauen (ich)

Produktion läuft weiter auf Hostinger. Auf Hetzner entsteht daneben eine vollständige,
testbare Instanz. **Noch keine DNS-Änderung.**

### Ich (I)

- **I-13 · `/opt/fabu` anlegen**, Owner `frank`, Repo-Stand per `deploy.sh` ausrollen.
- **I-14 · `.env.production` erzeugen** (chmod 600, User `frank`, nur auf dem Server):
  - `JWT_SECRET` **1:1 vom VPS** (siehe I-1)
  - `RESEND_API_KEY`, `MAIL_FROM=…@mail.fabu-online.de` 1:1 vom VPS
  - `POSTGRES_PASSWORD` **neu generiert** (64 Byte hex) — die DB ist neu, das alte
    Host-Postgres-Passwort hat hier keinen Wert
  - `DATABASE_URL=postgresql://fabu:<neu>@postgres:5432/fabu` (Hostname = Service-Name)
  - `DB_CLIENT=postgres`, `NODE_ENV=production`, `APP_FRONTEND_URL=https://app.fabu-online.de`
- **I-15 · Stack starten**, Postgres-Health abwarten.
- **I-16 · Daten-Vorabkopie**: Dump vom VPS (`pg_dump` über `DATABASE_URL`, kein sudo
  nötig) → `pg_restore` in den Container; Uploads per `rsync` → Volume `fabu_uploads`.
  Das ist noch **nicht** der finale Stand (zwischen jetzt und dem Cutover können
  Buchungen entstehen) — es ist der Probelauf, der zeigt, dass Restore und
  Bildauslieferung funktionieren.
- **I-17 · Test ohne DNS.** Traefik routet nach `Host`-Header, also:
  ```
  curl -sk --noproxy '*' -H 'Host: app.fabu-online.de' https://78.46.70.46/api/version
  curl -sk --noproxy '*' -H 'Host: app.fabu-online.de' https://78.46.70.46/
  curl -sk --noproxy '*' -H 'Host: fabu-online.de'     https://78.46.70.46/impressum/
  ```
  Host-Header statt `--resolve`: letzteres wird in meiner Arbeitsumgebung
  ignoriert, und die Aufrufe landen dann unbemerkt auf der echten Produktion
  (§17.5).
  Das `-k` ist erwartet und richtig: ein echtes Zertifikat kann es vor der
  DNS-Umstellung nicht geben (Let's Encrypt validiert per HTTP-01 gegen die öffentliche
  IP). Geprüft wird hier Routing, Rendering, API, DB-Inhalt und Bildauslieferung
  (`/api/uploads/vehicles/<datei>.jpg`).
- **I-18 · Report an dich** mit den Testergebnissen, bevor irgendetwas an DNS passiert.

### Du (D)

- **D-5 · Freigabe für den DNS-Schnitt** nach meinem Report.

---

## 8. Phase 3 — DNS umstellen (der eigentliche Umzug)

Hier liegt das ganze Risiko, deshalb in **zwei entkoppelten Schritten**: erst den
Nameserver wechseln, **ohne dass sich an den Zielen etwas ändert**, dann die Ziele
umlegen. Der Nameserver-Wechsel ist damit ein Nicht-Ereignis, und der eigentliche
Schnitt ist ein TTL-300-Record-Flip, den man in Sekunden zurückdrehen kann.

### Schritt 3a — Zone bei Hetzner anlegen, Ziele noch auf Hostinger

**✅ Erledigt am 2026-10-24.** Zone-ID `1662373`, Zone-Default-TTL 300.
Angelegt sind genau die Records der aktiven Hostinger-Zone, alle Ziele noch
auf dem alten VPS:

| Name | Typ | TTL | Wert | Zweck |
|---|---|---|---|---|
| `@` | A | 300 | `187.124.170.226` | **noch alt** — Landing |
| `www` | CNAME | 300 | `fabu-online.de.` | Landing |
| `app` | A | 300 | `187.124.170.226` | **noch alt** — App |
| `omafun` | A | 300 | `187.124.170.226` | bleibt dauerhaft alt (§4) |
| `send.mail` | MX 10 | 3600 | `feedback-smtp.eu-west-1.amazonses.com.` | Resend Bounces |
| `send.mail` | TXT | 3600 | `v=spf1 include:amazonses.com ~all` | Resend SPF |
| `resend._domainkey.mail` | TXT | 3600 | `p=MIGf…IDAQAB` (218 Zeichen) | Resend DKIM |

TTL 300 auf allem, was beim Cutover umgelegt wird; 3600 auf den Mail-Records,
die sich nie aendern.

**Verifiziert**, indem die neuen Hetzner-Nameserver direkt abgefragt und Record
fuer Record gegen die noch aktive Hostinger-Zone gestellt wurden
(`dig @hydrogen.ns.hetzner.com` gegen `dig @ns1.dns-parking.com`): alle neun
geprueften Namen identisch, der DKIM-Wert im Volltext identisch (218 Zeichen
beidseitig). Die Delegation liegt weiter bei `ns1/ns2.dns-parking.com` — nach
aussen hat sich also nichts geaendert.

#### ⚠️ Korrektur: die Nameserver sind andere als gedacht

Eine **neu** angelegte Zone bekommt in der Hetzner Console nicht den
klassischen Satz, sondern die Cloud-DNS-Nameserver:

```
hydrogen.ns.hetzner.com
oxygen.ns.hetzner.com
helium.ns.hetzner.de
```

Meine fruehere Angabe (`ns1.your-server.de`, `ns3.second-ns.de`,
`ns.second-ns.com`) war aus `meinekladde.de` abgeleitet, das diesen Satz
tatsaechlich benutzt — aber das ist eine **migrierte** Alt-Zone, und fuer die
gilt er weiter. Fuer eine neue Zone ist er falsch. Die API sagt es eindeutig:

```
meinekladde.de  (migriert)  ns1.your-server.de. ns.second-ns.com. ns3.second-ns.de.
fabu-online.de  (neu)       hydrogen.ns.hetzner.com. oxygen.ns.hetzner.com. helium.ns.hetzner.de.
```

Das ist genau die Sorte Falle, die eine empirische Ableitung aus einer
Nachbar-Zone nicht faengt. Fuer die kommenden Umzuege: **immer** die
`authoritative_nameservers.assigned` der betroffenen Zone abfragen, nie von
einer anderen uebernehmen.

#### ✅ Entwarnung: die AAAA-Falle gilt hier nicht

Die neue Zone kam **leer** — nur `NS` und `SOA`, kein Default-AAAA und auch
keiner der Mail-Platzhalter, die die alte DNS-Konsole mitlieferte (Apex-MX auf
`wwwNNN.your-server.de`, Apex-SPF `v=spf1 +a +mx ?all`, `autoconfig`-CNAME und
vier SRV-Records — alles noch in `meinekladde.de` und
`lustiges-tabellenspiel.de` zu sehen).

Damit entfaellt das Risiko, das bei `meinekladde.de` am 21.10.2026 zwei
Zertifikatsantraege gekostet hat. Es entfaellt aber nur, **weil geprueft
wurde** — nicht als Regel. Bei der naechsten Zone wieder nachsehen.

Nebenbefund: `lustiges-tabellenspiel.de` hat seine Zone **schon** bei Hetzner
(ID 1468356), nur die A-Records zeigen noch auf den VPS. Dessen Umzug (D-14)
ist damit ebenfalls nur ein Record-Flip, kein Nameserver-Wechsel.

### Schritt 3b — Nameserver bei Hostinger umstellen

**Nur du** (Registrar-Zugang):

- **D-6 · Nameserver auf Hetzner umstellen.** hPanel → Domains →
  `fabu-online.de` → Nameserver → „Custom". Diese drei, genau so, in dieser
  Reihenfolge (aus `authoritative_nameservers.assigned` der Zone 1662373
  abgelesen, nicht geraten):
  ```
  hydrogen.ns.hetzner.com
  oxygen.ns.hetzner.com
  helium.ns.hetzner.de
  ```
  Achtung: **nicht** `ns1.your-server.de` — das ist der Satz der migrierten
  Alt-Zonen und fuer diese neue Zone falsch (siehe Korrektur in Schritt 3a).
  Das letzte endet auf **`.de`**, die ersten beiden auf `.com`.

  **Wirkung: keine.** Beide Zonen liefern fuer jeden Namen dasselbe — ich habe
  sie Record fuer Record verglichen. Egal welchen Nameserver ein Resolver
  erwischt, FaBu laeuft weiter auf Hostinger. Das nimmt dem
  DENIC-Delegationswechsel (bis zu 24 h) jede Dramatik.

  **Vorher noch D-1 liefern.** Die Zone enthaelt alles, was ich per `dig`
  finden konnte — aber einen Record-Namen, den niemand kennt, kann man nicht
  abfragen, und AXFR ist bei Hostinger gesperrt. Steht im hPanel noch ein
  Eintrag, den ich nicht erraten habe, faellt er mit diesem Schritt weg.

- **D-7 · Alte Hostinger-Zone noch nicht löschen** — erst nach Phase 5. Sie ist das
  Rollback.

### Schritt 3c — Verifikation (ich)

- **I-19**: `dig @hydrogen.ns.hetzner.com fabu-online.de` und Vergleich aller Records gegen
  §6-Tabelle; Delegation prüfen (`dig +trace NS fabu-online.de`); bestätigen, dass
  `omafun`, Mail-Records und Landing unverändert antworten.

---

## 9. Phase 4 — Cutover (ich, ~15 Minuten Fenster)

Zeitpunkt nach deiner Wahl, sinnvoll abends. Die Reihenfolge ist so gewählt, dass die
Datenbank **nie** gleichzeitig an zwei Stellen beschrieben wird.

| # | Schritt | Wer |
|---|---|---|
| I-20 | **Alt-Instanz schreibdicht machen**: `pm2 stop fabu-backend fabu-reminder-worker` auf dem VPS. Ab hier zeigt die App eine Fehlerseite — das ist der Beginn der Downtime. | ich |
| I-21 | **Final-Dump**: `pg_dump` + Uploads-`rsync` vom VPS, Delta einspielen (DB wird frisch restauriert, nicht gemerged — 8,5 MB, dauert Sekunden) | ich |
| I-22 | **Datenabgleich prüfen**: Row-Counts `users`/`vehicles`/`reservations`/`tenants`/`waitlist`/`invitation_codes` alt vs. neu müssen exakt übereinstimmen | ich |
| I-23 | **A-Records flippen**: `@` und `app` auf `78.46.70.46`, AAAA auf `2a01:4f8:120:3143::2`. `omafun` bleibt. TTL 300 → in ≤ 5 min überall sichtbar | ich (oder du, ohne Token) |
| I-24 | **Zertifikate**: Traefik holt sie beim ersten Request automatisch. Falls ein Antrag scheitert: `docker compose … up -d --force-recreate web` — ein `docker restart` genügt **nicht**, Traefik fordert erst bei geänderter Service-Identität zeitnah neu an (Erfahrung `meinekladde`, Zertifikat kam ~3 min später) | ich |
| I-25 | `resolvectl flush-caches` auf **beiden** Servern — `systemd-resolved` hält sonst die alten Adressen, und Cron-Jobs, die gegen die öffentliche URL laufen, treffen die falsche Maschine (Erfahrung `meinekladde`) | ich |
| I-26 | **Funktionstest**: Login, Fahrzeugliste, Bilder, Kalender, Reservierung anlegen, Bild-Upload > 1 MB, Passwort-Reset-Mail (prüft Resend-Records in der neuen Zone), Landing inkl. `/impressum` und `/datenschutz`, HTTPS-Redirect, `www`→Apex | ich |
| I-27 | **Reminder-Worker prüfen**: Logs zeigen Poll-Zyklen, keine DB-/Mail-Fehler | ich |
| D-8 | **Du klickst gegen**: Login mit deinem echten Account, eine Buchung, eine Mail. Zwei Augenpaare, weil nur du weißt, wie es sich *richtig* anfühlt | du |

**Erwartete Downtime: 5–15 min**, praktisch bestimmt von der Zertifikatsausstellung.

### Rollback (jederzeit in Phase 4, Dauer ~5 min)

1. A/AAAA-Records zurück auf `187.124.170.226` (TTL 300)
2. `pm2 start fabu-backend fabu-reminder-worker` auf dem VPS
3. fertig — der VPS ist unangetastet, inklusive DB, Uploads, nginx und Zertifikaten

Der Rollback bleibt so lange möglich, bis in Phase 5 bewusst abgeschaltet wird.

---

## 10. Phase 5 — Betrieb absichern (ich)

Erst hier ist der Umzug „fertig" — eine laufende App ohne Backup ist kein erledigter Umzug.

- **I-28 · Cron für `frank`** (nicht `root` — `crontab -l` als root zeigt nichts und
  schickt bei der Fehlersuche in die Irre). Freie Slots: Backup **05:00**, Wächter **08:55**.
  ```
  0 5 * * * /opt/fabu/infra/scripts/backup.sh >> /home/frank/logs/fabu-backup.log 2>&1
  55 8 * * * bash /opt/fabu/infra/scripts/check-backup-freshness.sh >> /home/frank/logs/fabu-backup-check.log 2>&1
  ```
- **I-29 · Reminder-Worker**: läuft als Container, braucht **keinen** Cron (im Gegensatz
  zu `meinekladde`, das seine Erinnerungen per Cron-Curl anstößt).
- **I-30 · Backup scharf testen**: Backup manuell auslaufen lassen, Wächter manuell
  laufen lassen, **und die Wiederherstellung in einen Wegwerf-Container prüfen**. Ein
  Backup, dessen Restore nie probiert wurde, ist eine Vermutung.
- **I-31 · Dokumentation nachziehen**:
  - `~/dev/HetznerServer/SERVER.md`: Abschnitt „fabu-online.de", Backup-Tabelle (05:00/08:55),
    Domain-Liste, „Offene nächste Schritte" aktualisieren
  - `FaBu/README.md`: Deployment-Abschnitt auf Docker/Traefik umschreiben, pm2/nginx-/Certbot-Teile
    entfernen
  - veraltet nach dem Umzug: `NGINX_SETUP_DOCS.md`, `PRODUCTION_AUTOSTART_GUIDE.md`,
    `SERVER_DEPLOYMENT_CHECKLIST.md`, `deploy-prod.sh`, `deploy-landing.sh`,
    `install-server.sh`, `setup-postgres.sh`, `setup-user.sh`, `ensure-autostart.sh`,
    `health-check.sh`, `update-app.sh`, `nginx-config-*-example`
    → als `docs/legacy-hostinger/` archivieren, nicht löschen (Rollback-Wissen), aber
    oben je Datei ein „gilt nicht mehr ab 2026-10-xx"-Hinweis
- **I-32 · GPG-Backup-Key**: Hier sticht ein offener Punkt vom Server: `klarliste` **und**
  `meinekladde` sichern ihre Secrets **nicht**, weil der Public Key fehlt — deren Wächter
  mailen deshalb täglich. Ich lege FaBus Backup so an, dass es ohne Key sauber läuft und
  warnt. **Den Schlüssel selbst musst du erzeugen** (D-10), weil der private Teil per
  Design niemals auf den Server darf.

### Du (D)

- **D-9 · 48 h Normalbetrieb beobachten.** Danach gilt der Umzug als bestätigt.
- **D-10 · GPG-Keypair** auf deinem Rechner erzeugen (`backup@fabu-online.de`), den
  **Public** Key als `infra/fabu-backup-pubkey.asc` ins Repo legen, den privaten Key
  offline sichern. Erledigt denselben offenen Punkt am besten gleich für `klarliste` und
  `meinekladde` mit.

---

## 11. Phase 6 — Alt-Instanz stilllegen

Erst nach D-9 (48 h stabil). Vorbild ist das Vorgehen bei `sportfoto-hrouda` (11.08.2026)
und `wordpress-frank` (21.08.2026), beides schon erfolgreich von diesem VPS weg.

### Ich (I)

- **I-33 · Letztes Archiv-Backup** des Alt-Systems (DB-Dump + Uploads + `.env`) offsite
  nach `offsite:fabu/legacy-hostinger-<datum>/` legen. Unabhängig davon, dass die neue
  Instanz sichert.
- **I-34 · pm2 aufräumen**: `pm2 delete fabu-backend fabu-reminder-worker && pm2 save`
  (geht ohne sudo). `omafun-web`/`omafun-worker` bleiben.

### Entfällt durch E-3 (VPS wird gelöscht)

Die beiden folgenden Schritte waren für den Fall gedacht, dass der VPS weiterläuft.
Da er gelöscht wird, sind sie **nicht nötig** — ich lasse sie als Rückfallebene
stehen, falls sich die Kündigung verzögert und FaBu auf dem VPS noch Monate
mitlaufen würde (dann ist eine totgelegte Site besser als eine, die veraltete Daten
ausliefert).

- **D-11 · nginx-Sites deaktivieren** (braucht `sudo`):
  ```bash
  sudo rm /etc/nginx/sites-enabled/fabu-online /etc/nginx/sites-enabled/fabu-landing
  sudo rm -f /etc/nginx/sites-enabled/ai.franksagent.de /etc/nginx/sites-enabled/hermes.franksagent.de
  sudo nginx -t && sudo systemctl reload nginx
  ```
  (Die beiden letzten sind Altlasten — ihr DNS zeigt längst auf Hetzner.)
- **D-12 · Alte DB erst *nach* I-33 löschen:**
  ```bash
  sudo -u postgres psql -c 'ALTER DATABASE fabu RENAME TO fabu_legacy_20261024;'
  ```
  Umbenennen statt `DROP`: kostet 8 MB und behält das Netz noch ein paar Wochen.

---

## 12. Phase 7 — Hostinger abgeben (du)

**Dies ist der Punkt, an dem der Auftrag über FaBu hinausgeht.** Nach Phase 6 ist FaBu
komplett weg vom VPS — aber der VPS kann noch nicht gekündigt werden:

| Blocker | Was fehlt | Aufwand (geschätzt) |
|---|---|---|
| `omafun` (pm2 ×2, Next.js, Port 3010, `omafun.fabu-online.de`) | eigener Umzug nach `franksagent` — gleiches Muster, eigenes Compose | ähnlich wie FaBu, aber ohne DNS-Umstellung (Zone liegt dann schon bei Hetzner) → deutlich einfacher |
| `lustiges-tabellenspiel.de` (+ `www`) | eigener Umzug **und** eigene DNS-/Registrar-Entscheidung | eigenes Paket |
| Alte Docker-Volumes `wordpress-me_*` | liegen laut `SERVER.md` noch als Sicherheitsnetz auf dem VPS | nur wegwerfen |

Reihenfolge, die ich empfehle:

1. **D-13** `omafun` umziehen (kann ich fast komplett übernehmen, sobald du grünes Licht
   gibst — die Zone ist dann schon bei Hetzner, es ist nur ein Record-Flip)
2. **D-14** `lustiges-tabellenspiel.de` umziehen oder abschalten
3. **D-15 · Registrar-Transfer** `fabu-online.de` (Entscheidung E-1): AuthInfo-Code im
   hPanel ziehen (Domain vorher entsperren, Privacy-Schutz aus), beim Zielanbieter
   Transfer beauftragen, AuthInfo eintragen. Nameserver bleiben Hetzner → **kein**
   Website-Ausfall. Dauer 1–2 Werktage.
4. **D-16 · Hostinger-Zone löschen** — erst wenn die Hetzner-Zone nachweislich ≥ 1 Woche
   trägt und der Transfer durch ist.
5. **D-17 · VPS kündigen.** Vorher ein letztes Vollbackup ziehen lassen (sag mir Bescheid,
   das übernehme ich) — ein gekündigter VPS wird gelöscht, nicht archiviert.
6. **D-18 · Hostinger-Konto** schließen bzw. restliche Produkte kündigen.

---

## 13. Was nach dem Umzug *anders* ist (bewusste Änderungen)

| Vorher (Hostinger) | Nachher (franksagent) |
|---|---|
| `ssh deploy@… && ./deploy-prod.sh` (Git-Pull **auf** dem Server) | `./infra/scripts/deploy.sh` **vom Laptop** (git archive + tar + compose) |
| pm2 + `pm2 save` + Autostart-Skripte | `restart: unless-stopped` von Docker |
| nginx-Configs + Certbot pro Site | Traefik-Labels im Compose-File, Zertifikate automatisch |
| Host-Postgres, geteilt | eigener Postgres-Container, eigenes Volume |
| Uploads im Repo-Verzeichnis (`backend/data/uploads`) | Docker-Volume `fabu_uploads` — ein Rebuild kann sie nicht mehr mitnehmen |
| SQLite-Fallback + Migrationspfad in `deploy-prod.sh` | entfällt; Postgres ist gesetzt. `better-sqlite3` bleibt als Dependency im Image (Code importiert es), wird produktiv aber nie benutzt |
| Backup: keines für FaBu | 05:00 offsite, 08:55 Wächter, montags Totmannschalter-Mail |
| `JWT_SECRET` | **unverändert** — Logins und offene Reset-Links bleiben gültig |
| Datenbank-Passwort | neu |

---

## 14. Risiken und die Gegenmaßnahme je Risiko

| Risiko | Gegenmaßnahme |
|---|---|
| ~~Default-AAAA von Hetzner bricht die Zertifikatsausstellung~~ | **Entfallen**: die neue Zone kam leer, kein AAAA (Schritt 3a). Geprueft, nicht angenommen |
| **Falscher Nameserver-Satz bei D-6** | Die drei Namen stammen aus `authoritative_nameservers.assigned` der Zone selbst, nicht aus einer Nachbar-Zone — dort waeren sie falsch gewesen |
| **Compose ohne `name:` greift fremde Container** (bei `selbstanker` passiert) | `name: fabu` gesetzt, zusätzlich immer `-p fabu` übergeben |
| **Traefik fordert nach gescheitertem ACME nicht neu an** | `up -d --force-recreate <service>` statt `docker restart`; Traefik selbst nicht neustarten (träfe alle Seiten) |
| **`systemd-resolved` cacht alte IPs** | `resolvectl flush-caches` auf beiden Servern (I-25) |
| **Verlorenes Executable-Bit killt das Backup lautlos** (41 Nächte bei `sportfoto`) | Wächter-Aufruf per `bash <pfad>`, Prüfung **am Ziel**, wöchentliche OK-Mail als Totmannschalter |
| **Resend-Mails fallen aus**, weil DKIM/SPF beim Zonenwechsel fehlen | Records in Schritt 3a **vor** dem NS-Wechsel anlegen; Passwort-Reset-Mail ist Teil des Abnahmetests (I-26) |
| **Unbekannter Record aus der Hostinger-Zone fällt weg** | D-1 Zonen-Export; alte Zone bis Phase 7 behalten |
| **`omafun` fällt mit der DNS-Umstellung aus** | `omafun`-A-Record zeigt in der neuen Zone weiter auf den VPS (§4) |
| **Datenverlust durch Doppelschreiben** | I-20 stoppt die Alt-Instanz **vor** dem Final-Dump; Row-Count-Vergleich (I-22) |
| **Bild-Uploads > 1 MB brechen** (war schon mal ein Bug: 413) | `client_max_body_size 8m`, Upload > 1 MB im Abnahmetest (I-26) |
| **Backup existiert, Restore funktioniert nicht** | I-30 testet den Restore in einen Wegwerf-Container |

---

## 15. Aufwand und Reihenfolge

| Phase | Ich | Du | Kalenderzeit |
|---|---|---|---|
| 0 Vorbereitung | ~30 min | ~15 min (Zonen-Export, 3 Entscheidungen, evtl. Token) | 1 Tag |
| 1 Containerisierung | ~3–4 h | 0 (optional Review) | 1 Tag |
| 2 Parallelaufbau + Test | ~1–2 h | 5 min Freigabe | ½ Tag |
| 3 DNS (NS-Wechsel, wirkungslos) | ~20 min | ~5 min (hPanel) | bis 24 h Wartezeit |
| 4 Cutover | ~45 min | ~10 min Gegentest | **5–15 min Downtime** |
| 5 Backup + Doku | ~1,5 h | 15 min (GPG-Key) | 1 Tag |
| 6 Stilllegen | ~20 min | ~5 min (4 sudo-Befehle) | nach 48 h stabil |
| 7 Hostinger abgeben | je nach `omafun` | Registrar + Kündigung | Wochen (eigene Projekte) |

**Dein Gesamtaufwand bis FaBu live auf Hetzner: ca. 35–50 Minuten**, verteilt auf
Zonen-Export, Nameserver-Umstellung im hPanel, zwei Freigaben, ein Gegentest, GPG-Key.
Mit DNS-API-Token fallen davon noch die Record-Klickarbeiten weg.

Alles andere übernehme ich.

---

## 16. Kurz-Checkliste

**Du, jetzt:**
- [x] D-2 Entscheidungen E-1 / E-2 / E-3 getroffen (2026-10-24, siehe §3)
- [x] D-3 · API-Token geliefert (2026-10-24), Zone 1662373 angelegt und verifiziert
- [ ] **D-1 · Zonen-Export** `fabu-online.de` aus dem hPanel hierher pasten — das
      Einzige, was jetzt noch vor D-6 fehlt

**Du, später (je ein Stichwort von mir vorher):**
- [ ] D-5 Freigabe DNS-Schnitt · D-6 Nameserver im hPanel (hydrogen/oxygen/helium, siehe D-6) · D-8 Gegentest
- [ ] D-9 48 h beobachten · D-10 GPG-Keypair
- [ ] D-13 `omafun` umziehen · D-14 `lustiges-tabellenspiel.de` · D-15 Registrar-Transfer
      · D-17 VPS kündigen (**erst nach I-33**) · D-18 Hostinger-Konto schließen
- [ ] D-11 / D-12 entfallen (VPS wird gelöscht)

**Ich:** I-1 bis I-34 — Containerisierung, Parallelaufbau, Datenmigration, Cutover,
Zertifikate, Backup, Wächter, Doku, Stilllegung. Mit Token zusätzlich die komplette
DNS-Arbeit.

---

## 17. Befunde aus dem lokalen Probelauf (Phase 1, 2026-10-24)

Der Probelauf lief gegen den *echten* Produktions-Stack-Aufbau auf dem
Dev-Rechner: drei Images gebaut, eigener Traefik mit denselben Flags wie
`/opt/traefik/docker-compose.yml`, Datenbank aus einem `pg_dump` der
Produktion (9 Nutzer / 5 Fahrzeuge / 30 Reservierungen / 2 Mandanten,
Row-Counts gegengeprueft), Fahrzeugbilder aus dem echten Uploads-Verzeichnis.
Harness dafuer: `infra/docker-compose.local-test.yml`.

Grün durchgelaufen: alle drei Images bauen, die Prio-Aufteilung
(api 10 / web 1) trennt `/api` und `/uploads` korrekt vom SPA-Fallback,
Fahrzeugbilder sind unter beiden Pfaden erreichbar, `/calendar` und
`/admin/tenants` liefern den React-Router-Fallback, die Landing-Unterseiten
`/impressum` und `/datenschutz` funktionieren **und** ein unbekannter Pfad gibt
ein ehrliches 404, `www` und der HTTP→HTTPS-Redirect stimmen, ein fremder
Host-Header landet nicht bei FaBu, das Upload-Volume uebersteht ein
`--force-recreate`, und `initDb()` ist ueber mehrere Container-Starts
idempotent.

Dabei sind vier Dinge aufgefallen. Drei habe ich direkt behoben, eines ist
eine Entscheidung.

### 17.1 Behoben: nginx schickte den Redirect als `http://`

Astro baut mit `format: 'directory'`, legt also `impressum/index.html` ab. Ein
Aufruf von `/impressum` erzeugt deshalb ein 301 auf `/impressum/`. Hinter
Traefik baute nginx diesen Location-Header absolut aus `$scheme://$host` — und
`$scheme` ist **im Container `http`**, weil Traefik das TLS schon terminiert
hat. Herausgekommen ist `Location: http://fabu-online.de/impressum/`.

Funktioniert hätte es (Traefik leitet http auf https), aber ueber einen
unnoetigen Klartext-Umweg. Im alten Setup fiel das nicht auf, weil nginx dort
selbst TLS terminierte und `$scheme` bereits `https` war — es wäre also eine
Regression gewesen, die der Umzug eingeschleppt hätte.

Behoben mit `absolute_redirect off` in beiden nginx-Configs: der Header ist
jetzt relativ (`Location: /impressum/`) und damit unabhaengig von Schema, Host
und Port. Nachgeprueft.

### 17.2 Behoben: Der Worker pollte, bevor es ein Schema gab

Das Datenbankschema legt `initDb()` beim Start der **API** an
(`backend/src/db/client.js`); der Worker legt nichts an. Beide hingen nur an
`postgres: service_healthy`, starteten also gleichzeitig — und der Worker
loggte `relation "reservations" does not exist`. Er erholt sich nach einer
Minute von selbst, aber ein Fehler im Log, der keiner ist, kostet bei der
naechsten echten Stoerungssuche Zeit.

Behoben: `worker` haengt jetzt zusaetzlich an `api: service_healthy`.

### 17.3 Behoben: Der Worker wäre dauerhaft „unhealthy" gewesen

Der Worker benutzt dasselbe Image wie die API und erbte damit deren
HTTP-Healthcheck auf Port 3001 — auf dem er nicht lauscht. Er hätte für immer
als `unhealthy` dagestanden. Ein Container, der immer unhealthy ist, ist
schlimmer als keine Pruefung: er macht die Spalte in `docker ps` wertlos.

Behoben: `healthcheck: disable: true` für den worker-Service. Was ihn
stattdessen ueberwacht: stirbt der Prozess, endet der Container und
`restart: unless-stopped` startet ihn neu; fachliche Fehler stehen in
`docker logs fabu-worker`. Ein echter Lebenszeichen-Check (der Worker schreibt
bei jedem Durchgang einen Zeitstempel, der Healthcheck prueft dessen Alter)
wäre eine saubere Nachbesserung, braucht aber eine Code-Aenderung — als
Folgeaufgabe notiert, nicht Teil des Umzugs.

### 17.4 **Entscheidung nötig: Der Reminder-Worker ist schon heute kaputt**

Der Probelauf hat einen Fehler reproduziert, der **nicht** vom Umzug kommt:

```
[reminder-worker] Fehler beim Abrufen von Reminders:
function datetime(timestamp with time zone) does not exist
```

`backend/src/workers/reminder-worker.js` benutzt in zwei Stellen die
**SQLite**-Funktion `datetime()`:

- Zeile 74: `AND datetime(r.reminder_at_utc) <= datetime('now')`
- Zeile 91: `SET reminder_status = 'sending', reminder_sent_at = datetime('now')`

Postgres kennt `datetime()` nicht. Die Spalten sind
`timestamp with time zone`.

**Das ist kein Testartefakt.** Ich habe auf dem Produktionsserver
nachgesehen — `pm2 logs fabu-reminder-worker` zeigt dieselbe Zeile, minuetlich,
seit dem Prozessstart:

```
/home/deploy/.pm2/logs/fabu-reminder-worker-error.log
[reminder-worker] Fehler beim Abrufen von Reminders: function datetime(...) does not exist
   (15x dieselbe Zeile)
```

Die Folge: **seit der Umstellung auf PostgreSQL ist keine einzige
Fahrt-Erinnerung verschickt worden.** Der Fehler wird im `catch` geloggt und
der Worker macht weiter, deshalb ist es nie aufgefallen. Der Prozess steht in
`pm2 status` seit sieben Tagen auf `online`.

Der Fix selbst ist klein — in Postgres:

```sql
AND r.reminder_at_utc <= NOW()
SET reminder_status = 'sending', reminder_sent_at = NOW()
```

Weil das Backend aber beide Datenbanken unterstuetzen soll, gehoert das hinter
die Abstraktion in `db/client.js` (wie dort schon die `?`→`$1`-Umschreibung),
nicht als nackte Postgres-Syntax in den Worker.

**Warum ich das nicht einfach mitgefixt habe:** sobald die Abfrage
funktioniert, verschickt der Worker Mails — und zwar beim ersten Durchgang
alle Erinnerungen, die seit der Postgres-Umstellung mit
`reminder_status = 'pending'` liegen geblieben sind. Das sind Mails an echte
Nutzer über Fahrten, die teils längst vorbei sind. Das ist eine
nach-aussen-wirkende Aenderung und deine Entscheidung, nicht meine.

Drei Wege:

| | Vorgehen | Bewertung |
|---|---|---|
| **A** | Fix **vor** dem Umzug, und vorher die abgelaufenen Reminder auf `sent` setzen (`UPDATE reservations SET reminder_status='sent' WHERE reminder_status='pending' AND reminder_at_utc < NOW()`) | Empfohlen. Keine Mail-Flut, Feature funktioniert ab dem Umzug, und der Umzug wird an einer bereits reparierten Anwendung geprueft |
| **B** | Fix **nach** dem Umzug als eigener kleiner Change | Trennt die Baustellen sauber, aber der Abnahmetest des Umzugs kann die Erinnerungen dann nicht mitpruefen |
| **C** | Erst mal nichts | Der Umzug aendert daran nichts — es bleibt kaputt wie heute. Dann aber bitte bewusst, nicht aus Versehen |

Unabhaengig davon steht im Konzept weiter unten die Abnahme der
**Passwort-Reset-Mail** (I-26): die laeuft über einen anderen Pfad
(`backend/src/mail/mailer.js`, kein `datetime()`) und ist von diesem Fehler
nicht betroffen.

### 17.5 Nebenbefund für die Testpraxis

`curl --resolve` wird in meiner Arbeitsumgebung **ignoriert** — meine ersten
Testaufrufe sind an der Sandbox vorbei auf die *echte Produktion* gegangen
(sichtbar daran, dass `/api/version` die dort deployte 1.09 lieferte, waehrend
der lokale Container 1.10 meldete). Gemerkt habe ich es nur, weil die
Versionsnummern auseinanderliefen.

Konsequenz für alle Tests vor der DNS-Umstellung (I-17): **nicht** `--resolve`
benutzen, sondern Host-Header plus Ziel-IP, und `--noproxy` setzen:

```bash
curl -sk --noproxy '*' -H 'Host: app.fabu-online.de' https://78.46.70.46/api/version
curl -sk --noproxy '*' -H 'Host: fabu-online.de'     https://78.46.70.46/impressum/
```

Das `-k` ist dabei erwartet und richtig: vor der DNS-Umstellung kann es kein
gueltiges Zertifikat geben, Traefik liefert sein Self-Signed aus und routet
trotzdem korrekt nach Host-Header.
