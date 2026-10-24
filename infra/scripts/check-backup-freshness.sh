#!/usr/bin/env bash
# Prueft, ob die Offsite-Backups von FaBu frisch sind
# (infra/scripts/backup.sh, taeglich 05:00) und mailt bei Problemen.
#
# WARUM DAS EIN EIGENES SKRIPT MIT EIGENEM CRON-EINTRAG IST — und kein Schritt
# im Backup-Skript: bei sportfoto-hrouda ist das naechtliche Backup vom 26.08.
# bis 05.10.2026 41 Mal hintereinander fehlgeschlagen, weil das Skript sein
# Executable-Bit verloren hatte. Gemerkt hat es niemand, weil nichts das
# Cron-Log liest und nichts das Offsite-Ziel auf Aktualitaet prueft. Eine
# Pruefung *innerhalb* des Backup-Skripts waere mit demselben "Permission
# denied" gestorben und haette genauso geschwiegen. Geprueft wird deshalb das
# Ergebnis am Ziel (was liegt wirklich offsite?), nicht der Ablauf.
#
# Aus demselben Grund ruft der Cron-Eintrag dieses Skript ueber "bash <pfad>"
# auf statt direkt: ein fehlendes Executable-Bit kann den Waechter dann nicht
# lahmlegen.
#
# Woechentlich kommt eine "Backup OK"-Mail, auch wenn alles stimmt. Das ist der
# Totmannschalter: bleibt sie aus, laeuft der Pruefer selbst nicht mehr — und
# genau dieser Fall blieb 41 Naechte unbemerkt. Abschaltbar mit WEEKLY_OK_DAY=
# (leer), Schwellen ueber MAX_AGE_HOURS.
#
# Mail-Zugangsdaten: ~/.config/backup-alert.env (RESEND_API_KEY, ALERT_EMAIL),
# serverweit fuer alle Projekte, weil der Key dem Server-Besitzer gehoert und
# nicht einer einzelnen App.
#
# Cron (in franks crontab):
#   55 8 * * * bash /opt/fabu/infra/scripts/check-backup-freshness.sh >> /home/frank/logs/fabu-backup-check.log 2>&1

PROJECT_NAME="fabu"
OFFSITE_REMOTE="${OFFSITE_REMOTE:-offsite:fabu}"
BACKUP_SCRIPT="/opt/fabu/infra/scripts/backup.sh"
BACKUP_LOG="/home/frank/logs/fabu-backup.log"
CHECK_LOG="/home/frank/logs/fabu-backup-check.log"

# Label|Unterverzeichnis|Muster|Mindestgroesse|required|optional
#
# Die Mindestgroesse der Datenbank liegt bewusst deutlich unter dem Ist-Stand
# (beim Einrichten am 24.10.2026: 5425 Bytes fuer 9 Tabellen mit 9 Nutzern,
# 5 Fahrzeugen und 30 Reservierungen). Sie soll nicht Wachstum ueberwachen,
# sondern den Fall finden, dass pg_dump gar nichts geliefert hat.
#
# Die Fahrzeugbilder haben bewusst *keine* Mindestgroesse: ein Bestand ohne
# Bilder ist ein legitimer Zustand (das Bild ist pro Fahrzeug optional), und
# ein leeres tar.gz von ~100 Bytes darf keine Warnung ausloesen. Geprueft wird
# hier nur das Alter — fehlt die Datei ganz, lief das Backup nicht.
#
# Die Secrets-Gruppe steht auf "required", obwohl sie beim Einrichten
# fehlschlaegt: infra/fabu-backup-pubkey.asc existiert noch nicht, deshalb
# ueberspringt backup.sh die .env.production-Sicherung mit einer Warnung — und
# eine Warnung, die nur im Log steht, liest niemand. Sie soll deshalb taeglich
# mailen, bis der GPG-Key eingerichtet ist (Anleitung: infra/RESTORE.md).
# Dasselbe ist bei klarliste und meinekladde noch offen; wer einen Key anlegt,
# erledigt am besten alle drei in einem Durchgang.
CHECK_GROUPS=(
  "Datenbank|db-dumps|fabu-db-*.sql.gz|2000|required"
  "Fahrzeugbilder|uploads|fabu-uploads-*.tar.gz|0|required"
  "Secrets (.env.production)|secrets|env.production-*.gpg|0|required"
)

set -uo pipefail

# rclone liegt in franks ~/.local/bin und ist nicht in jedem PATH (etwa dem von
# root oder dem minimalen von cron).
export PATH="$HOME/.local/bin:$PATH"

MAX_AGE_HOURS="${MAX_AGE_HOURS:-26}"
# Bewusst ${VAR-default} ohne Doppelpunkt: nur ein *nicht gesetztes*
# WEEKLY_OK_DAY bekommt den Default. Mit der Doppelpunkt-Form waere ein leer
# gesetzter Wert ebenfalls ersetzt worden und die Abschaltung ginge nicht.
WEEKLY_OK_DAY="${WEEKLY_OK_DAY-Mon}"
ALERT_ENV_FILE="${ALERT_ENV_FILE:-$HOME/.config/backup-alert.env}"

log() { echo "[${PROJECT_NAME}-check] $(date -Is) $*"; }

problems=()
details=()

# rclone lsl liefert "<bytes> YYYY-MM-DD HH:MM:SS.ffffffff <name>" in lokaler
# Zeit. Gibt die neueste Datei einer Gruppe zurueck, oder nichts.
newest_of() {
  rclone lsl "$OFFSITE_REMOTE/$1" --include "$2" 2>/dev/null | sort -k2,3 | tail -1
}

# $1 Label, $2 Unterverzeichnis, $3 Muster, $4 Mindestgroesse (0 = egal),
# $5 required|optional — optional meldet nichts, wenn es die Gruppe noch gar
# nicht gibt.
check_group() {
  local label="$1" subdir="$2" pattern="$3" min_bytes="$4" mode="$5"
  local line size file_date file_time name epoch now age_h

  line="$(newest_of "$subdir" "$pattern")"

  if [[ -z "$line" ]]; then
    if [[ "$mode" == "optional" ]]; then
      log "$label: keine Datei offsite — uebersprungen (optional)"
    else
      problems+=("$label: keine einzige Datei offsite gefunden ($OFFSITE_REMOTE/$subdir, Muster $pattern)")
    fi
    return
  fi

  size="$(awk '{print $1}' <<<"$line")"
  file_date="$(awk '{print $2}' <<<"$line")"
  file_time="$(awk '{print $3}' <<<"$line")"
  name="$(awk '{print $4}' <<<"$line")"

  epoch="$(date -d "$file_date ${file_time%%.*}" +%s 2>/dev/null)"
  if [[ -z "$epoch" ]]; then
    problems+=("$label: Zeitstempel von $name nicht lesbar ($file_date $file_time)")
    return
  fi

  now="$(date +%s)"
  age_h=$(( (now - epoch) / 3600 ))

  details+=("$label: $name, ${age_h} h alt, $(numfmt --to=iec --suffix=B "$size" 2>/dev/null || echo "${size} B")")

  if (( age_h > MAX_AGE_HOURS )); then
    problems+=("$label: neueste Datei ist ${age_h} h alt (Grenze ${MAX_AGE_HOURS} h) — $name")
  fi

  if (( min_bytes > 0 )) && (( size < min_bytes )); then
    problems+=("$label: $name ist nur ${size} Bytes gross (erwartet mindestens ${min_bytes}) — der Dump-Schritt hat vermutlich nichts geliefert")
  fi

  log "$label: $name, ${age_h} h alt, ${size} Bytes"
}

log "pruefe $OFFSITE_REMOTE"

# Erreichbarkeit zuerst: ist die Storage Box nicht erreichbar, waeren alle
# Einzelpruefungen leer und wuerden als "keine Datei offsite" gemeldet — eine
# irrefuehrende Diagnose fuer ein Netzwerk- oder Auth-Problem.
if ! rclone lsd "$OFFSITE_REMOTE" >/dev/null 2>&1; then
  problems+=("Offsite-Ziel $OFFSITE_REMOTE ist nicht erreichbar (rclone lsd fehlgeschlagen) — Netzwerk, SSH-Key oder rclone-Konfiguration pruefen")
  log "FEHLER: Offsite-Ziel nicht erreichbar — Einzelpruefungen uebersprungen"
else
  for g in "${CHECK_GROUPS[@]}"; do
    IFS='|' read -r g_label g_subdir g_pattern g_min g_mode <<<"$g"
    check_group "$g_label" "$g_subdir" "$g_pattern" "$g_min" "$g_mode"
  done
fi

# --- Benachrichtigung --------------------------------------------------------

json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | awk '{printf "%s\\n", $0}'
}

send_mail() {
  local subject="$1" body="$2" api_key="" to="" response

  if [[ -f "$ALERT_ENV_FILE" ]]; then
    api_key="$(grep -E '^RESEND_API_KEY=' "$ALERT_ENV_FILE" | cut -d= -f2- | tr -d '"')"
    to="$(grep -E '^ALERT_EMAIL=' "$ALERT_ENV_FILE" | cut -d= -f2- | tr -d '"')"
  fi

  if [[ -z "$api_key" || -z "$to" ]]; then
    log "FEHLER: keine Mail-Zugangsdaten in $ALERT_ENV_FILE — keine Mail verschickt"
    return 1
  fi

  # Resends Sandbox-Absender onboarding@resend.dev: braucht keine
  # Domain-Verifizierung und darf nur an die eigene Resend-Kontoadresse
  # senden — fuer eine Warnung an den Betreiber selbst genau richtig.
  #
  # Bewusst NICHT die verifizierte App-Domain (mail.fabu-online.de, siehe
  # MAIL_FROM): der Waechter soll auch dann noch mailen koennen, wenn an der
  # Domain oder ihren DNS-Records etwas kaputt ist — und ein DNS- oder
  # Zonenproblem ist nach dem Umzug der wahrscheinlichste Stoerfall. Die
  # Warnung wuerde sonst genau in dem Moment verstummen, in dem sie zaehlt.
  # Zudem nimmt der Waechter so dieselben Zugangsdaten wie die anderen
  # Projekte auf diesem Server (~/.config/backup-alert.env).
  response="$(curl -s -o /dev/null -w '%{http_code}' -X POST https://api.resend.com/emails \
    -H "Authorization: Bearer ${api_key}" \
    -H "Content-Type: application/json" \
    -d "{\"from\":\"Backup-Waechter ${PROJECT_NAME} <onboarding@resend.dev>\",\"to\":[\"${to}\"],\"subject\":\"$(json_escape "$subject" | sed 's/\\n$//')\",\"text\":\"$(json_escape "$body")\"}")"

  if [[ "$response" == "200" ]]; then
    log "Mail an $to verschickt (HTTP $response)"
    return 0
  fi

  log "FEHLER: Mailversand fehlgeschlagen (HTTP $response)"
  return 1
}

if (( ${#problems[@]} > 0 )); then
  body="Die Offsite-Backups von ${PROJECT_NAME} sind nicht in Ordnung."$'\n\n'
  for p in "${problems[@]}"; do
    body+="- ${p}"$'\n'
    log "PROBLEM: $p"
  done
  body+=$'\n'"Aktueller Stand offsite:"$'\n'
  if (( ${#details[@]} > 0 )); then
    for d in "${details[@]}"; do body+="- ${d}"$'\n'; done
  else
    body+="- nichts ermittelbar"$'\n'
  fi
  body+=$'\n'"Backup-Log:   ${BACKUP_LOG}"$'\n'
  body+="Pruef-Log:    ${CHECK_LOG}"$'\n'
  body+="Manuell:      su - frank -c ${BACKUP_SCRIPT}"$'\n'

  send_mail "[${PROJECT_NAME}] Backup-Warnung: ${#problems[@]} Problem(e)" "$body"
  log "fertig — ${#problems[@]} Problem(e)"
  exit 1
fi

log "alle Pruefungen in Ordnung"

if [[ -n "$WEEKLY_OK_DAY" && "$(date +%a)" == "$WEEKLY_OK_DAY" ]]; then
  body="Die Offsite-Backups von ${PROJECT_NAME} sind in Ordnung."$'\n\n'
  for d in "${details[@]}"; do body+="- ${d}"$'\n'; done
  body+=$'\n'"Diese Mail kommt woechentlich, damit ihr Ausbleiben selbst eine Warnung ist:"$'\n'
  body+="kommt sie nicht, laeuft der Pruefer nicht mehr."$'\n'
  send_mail "[${PROJECT_NAME}] Backup OK (Wochenmeldung)" "$body"
fi

exit 0
