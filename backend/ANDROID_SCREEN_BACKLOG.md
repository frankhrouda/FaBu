# Android Screen Backlog (Schritt 4)

Dieses Backlog uebersetzt die vorhandene Web-Funktionalitaet in eine priorisierte Android-Umsetzung.

Bezug:
- API-Vertrag: `backend/API.md`
- Android-Grundsetup: `backend/ANDROID_CLIENT_REFERENCE.md`

## Priorisierung

- P0: Login + Fahrzeugliste + Reservierung erstellen
- P1: Reservierungen ansehen + Stornieren + Abschliessen
- P2: Admin-Screens

## Screen 1: Login (P0)

Ziel:
- Benutzer kann sich anmelden und bleibt eingeloggt.

API:
- `POST /auth/login`

Tasks:
- Login-UI mit `email` und `password`
- Validierung (nicht leer, E-Mail-Format grob)
- API-Call mit Loading/Error-State
- `token` in `TokenStore` speichern
- Nach Erfolg zu Dashboard navigieren
- Bei `401` klare Fehlermeldung anzeigen

Abnahmekriterien:
- Gueltige Daten fuehren zu erfolgreichem Login und Persistenz des Tokens
- Ungueltige Daten/401 zeigen nutzerfreundliche Meldung

## Screen 2: Registrierung (optional P0/P1)

Ziel:
- Neue Benutzer koennen Account anlegen (falls gewuenscht).

API:
- `POST /auth/register`

Tasks:
- UI fuer `name`, `email`, `password`
- Passwortlaenge mind. 6 auf Client pruefen
- API-Call und Fehleranzeige (`409` E-Mail belegt)
- Nach Erfolg automatisch einloggen (Token speichern)

Abnahmekriterien:
- Erfolgreiche Registrierung erstellt Account und Session
- `409` wird korrekt als E-Mail bereits vergeben dargestellt

## Screen 3: Dashboard/Fahrzeugliste (P0)

Ziel:
- Verfuegbare Fahrzeuge schnell sichtbar machen.

API:
- `GET /vehicles`

Tasks:
- Liste mit Name, Kennzeichen, Typ
- Pull-to-Refresh
- Leerer Zustand (keine Fahrzeuge)
- Fehlerzustand inkl. Retry
- Optional Filter (aktiv/inaktiv fuer Admin)

Abnahmekriterien:
- Liste laedt beim Oeffnen und bei Refresh stabil
- Netzfehler werden abgefangen, App crasht nicht

## Screen 4: Neue Reservierung (P0)

Ziel:
- Nutzer kann Reservierung mit Zeitfenster erstellen.

API:
- `GET /reservations/availability`
- `POST /reservations`

Tasks:
- Formular: Fahrzeug, Datum, Zeit von/bis, Grund
- Vor Absenden Verfuegbarkeit pruefen
- Zeit-Validierung (von < bis)
- `409` Konflikt sauber darstellen
- Nach Erfolg Ruecknavigation + Success-Feedback

Abnahmekriterien:
- Gueltige Reservierung wird erstellt (`201`)
- Konflikte zeigen klare Meldung ohne Datenverlust im Formular

## Screen 5: Meine Reservierungen (P1)

Ziel:
- Nutzer sieht eigene Reservierungen und Status.

API:
- `GET /reservations`

Tasks:
- Liste nach Datum/Zeit sortiert darstellen
- Status-Chips (`reserved`, `completed`, `cancelled`)
- Detailansicht oder Expand-Row fuer mehr Infos

Abnahmekriterien:
- Daten sind konsistent mit Backend
- Darstellung unterscheidet Status eindeutig

## Screen 6: Reservierung stornieren (P1)

Ziel:
- Aktive Reservierungen stornierbar machen.

API:
- `PATCH /reservations/{id}/cancel`

Tasks:
- Aktion nur bei `reserved` anbieten
- Bestaetigungsdialog
- Nach Erfolg Liste aktualisieren
- Fehler (`400`, `403`, `404`) sauber anzeigen

Abnahmekriterien:
- Storno aktualisiert Status sofort sichtbar auf `cancelled`

## Screen 7: Fahrt abschliessen (P1)

Ziel:
- Kilometer und Zielort fuer Reservierung erfassen.

API:
- `PATCH /reservations/{id}/complete`

Tasks:
- UI fuer `km_driven`, `destination`
- Validierung (`km_driven > 0`, destination nicht leer)
- Fehlerbehandlung (`400`, `403`, `404`)
- Erfolgreiches Update in Liste sofort sichtbar

Abnahmekriterien:
- Abschluss setzt Status auf `completed`
- Pflichtfelder werden clientseitig und serverseitig korrekt beachtet

## Screen 8: Admin - Nutzerverwaltung (P2)

Ziel:
- Admin kann Benutzer sehen, Rolle aendern, Nutzer loeschen.

API:
- `GET /users`
- `PATCH /users/{id}/role`
- `DELETE /users/{id}`

Tasks:
- Rollenwechsel-UI (user/admin)
- Sicherheitsabfragen vor loeschen
- Self-Protection-Fehler (`400`) anzeigen

Abnahmekriterien:
- Rollenwechsel und Loeschen wirken sofort in der Liste
- Eigener Account kann nicht geloescht/geaendert werden

## Screen 9: Admin - Fahrzeugverwaltung (P2)

Ziel:
- Admin kann Fahrzeuge anlegen/aendern/deaktivieren.

API:
- `POST /vehicles`
- `PUT /vehicles/{id}`
- `DELETE /vehicles/{id}`

Tasks:
- Create/Edit Form
- Validierung fuer Name/Kennzeichen
- Konflikte (`409`) bei Kennzeichen sauber behandeln
- Soft-Delete als "deaktivieren" darstellen

Abnahmekriterien:
- CRUD-Flow fuer Fahrzeuge stabil, ohne Inkonsistenzen

## Querschnittsthemen (alle Screens)

Tasks:
- Einheitliches Error-Mapping (`401`, `403`, `409`, `429`, `500`)
- Globaler Session-Handler:
  - Bei `401` Token loeschen und Login erzwingen
- Loading/Empty/Error-States je Screen
- Telemetrie/Logging fuer API-Fehler
- Optional Offline-Cache (Room) fuer Listen

Abnahmekriterien:
- Kein unhandled Fehler fuehrt zum App-Absturz
- Session-Verhalten ist fuer Nutzer nachvollziehbar

## Milestones

- M1 (P0): Login + Fahrzeugliste + Reservierung erstellen
- M2 (P1): Reservierungsliste + Storno + Abschluss
- M3 (P2): Admin Nutzer/Fahrzeuge

## Definition of Done

- Jeder Screen hat Loading-, Success- und Error-Zustand
- Jeder API-Fehlercode aus `backend/API.md` ist mindestens einmal getestet
- Manuelle End-to-End-Pruefung auf echtem Android-Geraet
- Release Notes mit bekannten Einschraenkungen vorhanden
