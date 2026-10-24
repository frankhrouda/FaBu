#!/usr/bin/env bash
# Naechtliches Backup fuer FaBu. Laeuft AUF DEM SERVER per Cron, als User
# frank (der darf Docker, und rclone liegt in seinem ~/.local/bin).
#
# Gesichert wird dreierlei:
#   1. die Postgres-Datenbank (pg_dump, gezippt)
#   2. die Fahrzeugbilder aus dem Docker-Volume
#   3. .env.production, GPG-verschluesselt — darin stehen JWT_SECRET und
#      DB-Passwort, ohne die eine Wiederherstellung nichts bringt
#
# Punkt 2 ist kein Nebenaspekt: ein Datenbank-Dump ohne die Bilder gibt
# Fahrzeuge mit toten Bildpfaden zurueck (vehicles.image_path zeigt dann ins
# Leere).
#
# Der GPG-Schritt uebergeht sich selbst mit einer Warnung, wenn kein Public
# Key im Repo liegt — ein fehlender Schluessel soll nicht den ganzen Lauf
# scheitern lassen. Den Public Key zu committen ist unbedenklich (er kann nur
# verschluesseln); der private Schluessel gehoert NICHT auf den Server,
# siehe infra/RESTORE.md.
#
# Cron (in franks crontab, 05:00 — 03:00/03:15/03:30/04:00/04:30 sind von
# sportfoto/wordpress/cv/klarliste/meinekladde belegt):
#   0 5 * * * /opt/fabu/infra/scripts/backup.sh >> /home/frank/logs/fabu-backup.log 2>&1

set -euo pipefail
cd "$(dirname "$0")/../.."

# rclone liegt in franks ~/.local/bin und ist nicht im minimalen PATH von cron.
export PATH="$HOME/.local/bin:$PATH"

OFFSITE_REMOTE="${OFFSITE_REMOTE:-offsite:fabu}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/fabu}"
GPG_RECIPIENT="${GPG_RECIPIENT:-backup@fabu-online.de}"
GPG_PUBKEY_FILE="${GPG_PUBKEY_FILE:-infra/fabu-backup-pubkey.asc}"
COMPOSE="docker compose -f infra/docker-compose.prod.yml --env-file .env.production"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"

echo "[backup] $(date -Is) Datenbank sichern..."
DUMP_FILE="$BACKUP_DIR/fabu-db-$STAMP.sql.gz"
# `set -o pipefail` ist oben gesetzt: scheitert pg_dump, scheitert auch die
# Pipe — sonst entstuende eine gueltig aussehende, leere .sql.gz.
$COMPOSE exec -T postgres pg_dump -U fabu fabu | gzip > "$DUMP_FILE"

echo "[backup] $(date -Is) Fahrzeugbilder sichern..."
# Aus dem laufenden Container heraus, damit der Volume-Pfad auf dem Host nicht
# geraten werden muss.
UPLOADS_FILE="$BACKUP_DIR/fabu-uploads-$STAMP.tar.gz"
docker exec fabu-api tar -cz -C /repo/backend/data/uploads . > "$UPLOADS_FILE"

if [[ -f "$GPG_PUBKEY_FILE" && -f .env.production ]]; then
  echo "[backup] $(date -Is) .env.production verschluesseln..."
  gpg --no-default-keyring --keyring /tmp/fabu-backup.gpg --import "$GPG_PUBKEY_FILE" 2>/dev/null
  gpg --no-default-keyring --keyring /tmp/fabu-backup.gpg --trust-model always \
    --recipient "$GPG_RECIPIENT" --encrypt --output "$BACKUP_DIR/env.production-$STAMP.gpg" \
    .env.production
else
  echo "[backup] WARNUNG: $GPG_PUBKEY_FILE oder .env.production fehlt — Secrets werden nicht gesichert."
fi

if command -v rclone > /dev/null; then
  echo "[backup] $(date -Is) offsite hochladen..."
  rclone copy "$DUMP_FILE"    "$OFFSITE_REMOTE/db-dumps"
  rclone copy "$UPLOADS_FILE" "$OFFSITE_REMOTE/uploads"
  [[ -f "$BACKUP_DIR/env.production-$STAMP.gpg" ]] &&
    rclone copy "$BACKUP_DIR/env.production-$STAMP.gpg" "$OFFSITE_REMOTE/secrets"
else
  echo "[backup] WARNUNG: rclone fehlt — Backup liegt nur lokal in $BACKUP_DIR."
fi

echo "[backup] $(date -Is) lokale Kopien aelter als $RETENTION_DAYS Tage entfernen..."
find "$BACKUP_DIR" -type f -mtime "+$RETENTION_DAYS" -delete

echo "[backup] $(date -Is) fertig."
