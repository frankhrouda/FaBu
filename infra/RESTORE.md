# FaBu wiederherstellen

Diese Anleitung geht vom schlimmsten Fall aus: der Server ist weg, es gibt nur
noch das Offsite-Backup auf der Hetzner Storage Box. Zwischenfaelle (nur die
Datenbank kaputt, nur die Bilder weg) sind Teilmengen davon — die Abschnitte
sind einzeln ausfuehrbar.

Alle Befehle laufen als User `frank` aus `/opt/fabu`.

## Was gesichert wird und was nicht

`infra/scripts/backup.sh` legt taeglich um 05:00 drei Dinge nach
`offsite:fabu/` ab:

| Offsite-Pfad | Inhalt | Ohne das |
|---|---|---|
| `db-dumps/fabu-db-*.sql.gz` | `pg_dump` der Datenbank | keine Nutzer, Fahrzeuge, Reservierungen, Mandanten |
| `uploads/fabu-uploads-*.tar.gz` | Fahrzeugbilder aus dem Volume | Fahrzeuge mit toten Bildpfaden (`vehicles.image_path` zeigt ins Leere) |
| `secrets/env.production-*.gpg` | `.env.production`, GPG-verschluesselt | kein `JWT_SECRET`, kein DB-Passwort — der Dump liesse sich nicht in Betrieb nehmen |

**Nicht** gesichert, weil jederzeit reproduzierbar: der Code (Git), die Images
(werden gebaut), die TLS-Zertifikate (Traefik holt sie neu).

`check-backup-freshness.sh` prueft taeglich um 08:55 das Ergebnis am Ziel und
mailt bei Problemen. Montags kommt eine „Backup OK"-Mail — bleibt sie aus,
laeuft der Pruefer selbst nicht mehr.

## Voraussetzung: der GPG-Schluessel

Die Secrets sind mit einem oeffentlichen Schluessel verschluesselt, dessen
privater Teil **per Design nie auf dem Server liegt**. Ohne ihn ist
`env.production-*.gpg` unlesbar.

Einrichten (einmalig, auf dem Rechner des Betreibers — **nicht** auf dem Server):

```bash
gpg --quick-generate-key "FaBu Backup <backup@fabu-online.de>" rsa4096 encr never
gpg --armor --export backup@fabu-online.de > infra/fabu-backup-pubkey.asc
git add infra/fabu-backup-pubkey.asc && git commit -m "Add backup public key"
```

Den **privaten** Schluessel offline sichern (Passwortmanager, Papier, zweiter
Datentraeger):

```bash
gpg --armor --export-secret-keys backup@fabu-online.de > fabu-backup-private.asc
```

> Solange `infra/fabu-backup-pubkey.asc` fehlt, ueberspringt `backup.sh` die
> Secret-Sicherung mit einer Warnung, und `check-backup-freshness.sh` mailt
> deshalb **taeglich**. Das ist Absicht, nicht ein Fehler: eine Warnung, die
> nur im Log steht, liest niemand. Bei `klarliste` und `meinekladde` ist
> dasselbe noch offen — am besten alle drei in einem Durchgang erledigen.

## 1. Server vorbereiten

Wie in `~/dev/HetznerServer/SERVER.md` beschrieben: Docker, Compose-Plugin,
User `frank` in der Gruppe `docker`, Traefik unter `/opt/traefik`, externes
Netzwerk `web`.

```bash
docker network create web          # nur falls noch nicht vorhanden
sudo mkdir -p /opt/fabu && sudo chown frank:frank /opt/fabu
```

## 2. Code ausrollen

Vom Dev-Rechner, aus dem Repo-Root:

```bash
./infra/scripts/deploy.sh
```

Der erste Lauf scheitert erwartbar am Health-Check — es gibt noch keine
`.env.production` und keine Daten. Der Code liegt danach aber auf dem Server.

## 3. Secrets zurueckholen

```bash
rclone copy offsite:fabu/secrets ~/restore/secrets --include "env.production-*.gpg"
# Auf dem Rechner mit dem privaten Schluessel entschluesseln:
gpg --decrypt env.production-<STAMP>.gpg > .env.production
```

Dann nach `/opt/fabu/.env.production` legen:

```bash
chmod 600 /opt/fabu/.env.production
chown frank:frank /opt/fabu/.env.production
```

**Falls die Secrets nicht wiederherstellbar sind** (kein GPG-Key), ist das kein
Totalverlust, aber mit Folgen:

- `POSTGRES_PASSWORD` und `DATABASE_URL` darf man frei neu setzen — die
  Datenbank wird aus dem Dump neu aufgebaut, nicht uebernommen.
- `JWT_SECRET` neu setzen bedeutet: **alle** aktiven Logins und alle offenen
  Passwort-Reset-Links sind sofort ungueltig. Die Nutzer muessen sich neu
  anmelden. Die Daten selbst bleiben unberuehrt.
- `RESEND_API_KEY` neu im Resend-Konto erzeugen.

Vorlage mit Erklaerung jedes Feldes: `.env.production.example`.

## 4. Datenbank wiederherstellen

```bash
cd /opt/fabu
COMPOSE="docker compose -f infra/docker-compose.prod.yml --env-file .env.production"

# Nur Postgres starten, damit nichts in eine halb gefuellte DB schreibt.
$COMPOSE up -d postgres
$COMPOSE exec postgres pg_isready -U fabu -d fabu

rclone copy offsite:fabu/db-dumps ~/restore/db --include "fabu-db-*.sql.gz"
gunzip -c ~/restore/db/fabu-db-<STAMP>.sql.gz | $COMPOSE exec -T postgres psql -U fabu -d fabu
```

Der Dump ist ein Plaintext-`pg_dump` und enthaelt `CREATE TABLE`, aber **kein**
`DROP`. Auf eine bereits gefuellte Datenbank angewandt, scheitert er mit
„already exists". In dem Fall vorher leeren:

```bash
$COMPOSE exec -T postgres psql -U fabu -d fabu -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
```

## 5. Fahrzeugbilder wiederherstellen

```bash
rclone copy offsite:fabu/uploads ~/restore/uploads --include "fabu-uploads-*.tar.gz"

# api starten, damit das Volume gemountet ist, dann hineinentpacken.
$COMPOSE up -d api
docker exec -i fabu-api tar -xz -C /repo/backend/data/uploads < ~/restore/uploads/fabu-uploads-<STAMP>.tar.gz
```

Das Archiv enthaelt relative Pfade ab dem Uploads-Wurzelverzeichnis
(`./vehicles/vehicle-<id>-<zeitstempel>.jpg`), passt also direkt auf das
Volume.

## 6. Alles starten und pruefen

```bash
$COMPOSE up -d --build
docker compose -f infra/docker-compose.prod.yml -p fabu ps
```

Pruefen, in dieser Reihenfolge:

```bash
# 1. Datenbestand vollstaendig?
$COMPOSE exec -T postgres psql -U fabu -d fabu -At -c \
  "select (select count(*) from users) users, (select count(*) from vehicles) vehicles,
          (select count(*) from reservations) reservations, (select count(*) from tenants) tenants;"

# 2. API antwortet?
curl -s https://app.fabu-online.de/api/version

# 3. Ein Fahrzeugbild erreichbar? (Pfad aus vehicles.image_path)
curl -I https://app.fabu-online.de/api/uploads/vehicles/<DATEINAME>.jpg

# 4. Landing inkl. Unterseiten (nicht nur die Startseite — ein falscher
#    nginx-Fallback faellt genau hier auf)
curl -I https://fabu-online.de/ https://fabu-online.de/impressum

# 5. Worker laeuft und pollt?
docker logs fabu-worker --tail 20
```

Dann im Browser: Login, Fahrzeugliste mit Bildern, Kalender, eine Reservierung
anlegen, Passwort-Reset-Mail anfordern (prueft Resend samt DNS-Records).

## 7. Zertifikate

Nichts zu tun — Traefik holt sie beim ersten Request ueber die HTTP-Challenge.

Falls ein Antrag scheitert (404 bei der Challenge), ist fast immer die
DNS-Zone die Ursache, nicht Traefik: Hetzner liefert neue Zonen mit einem
**AAAA**-Record auf einen eigenen Parkhost aus, und Let's Encrypt validiert
bevorzugt ueber IPv6 — die Challenge landet dann auf einer fremden Maschine.
AAAA entfernen oder auf `2a01:4f8:120:3143::2` zeigen lassen.

Nach korrigierter Zone fordert Traefik **nicht** von selbst zeitnah neu an.
Ein `docker restart` genuegt nicht, ein Neuaufbau des Service schon:

```bash
$COMPOSE up -d --force-recreate web
```

Traefik selbst nicht neu starten — das traefe kurz alle Seiten des Servers.

## 8. Cron wieder einrichten

In der Crontab von **`frank`** (nicht `root` — `crontab -l` als root zeigt
nichts und fuehrt bei der Fehlersuche in die Irre):

```cron
0 5 * * * /opt/fabu/infra/scripts/backup.sh >> /home/frank/logs/fabu-backup.log 2>&1
55 8 * * * bash /opt/fabu/infra/scripts/check-backup-freshness.sh >> /home/frank/logs/fabu-backup-check.log 2>&1
```

`mkdir -p /home/frank/logs` nicht vergessen.

Der Pruefer wird bewusst ueber `bash <pfad>` aufgerufen: ein verlorenes
Executable-Bit war bei `sportfoto-hrouda` die Ursache eines 41 Naechte langen,
unbemerkten Backup-Ausfalls und darf den Waechter nicht mittreffen.

## Ein Backup, dessen Restore nie geprobt wurde, ist eine Vermutung

Der Weg dafuer, ohne die Produktion anzufassen — auf dem Dev-Rechner, mit
einer Wegwerf-Datenbank:

```bash
docker run --rm -d --name fabu-restore-test \
  -e POSTGRES_USER=fabu -e POSTGRES_PASSWORD=test -e POSTGRES_DB=fabu \
  -p 127.0.0.1:5439:5432 postgres:16-alpine

gunzip -c fabu-db-<STAMP>.sql.gz | \
  docker exec -i fabu-restore-test psql -U fabu -d fabu

docker exec fabu-restore-test psql -U fabu -d fabu -At -c \
  "select (select count(*) from users), (select count(*) from reservations);"

docker rm -f fabu-restore-test
```

Port 5439, weil 5432 der System-Postgres ist und 5433–5438 von anderen
Projekten belegt sind.
