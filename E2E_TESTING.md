# E2E Smoke Tests

Dieses Repo enthält jetzt Playwright-Smoke-Tests für die kritischsten Web-Flows.

## Abgedeckte Flows

- Superadmin kann einen neuen Mandanten anlegen
- Öffentliche Tenant-Admin-Anfrage erscheint in der Mandantenverwaltung und kann angenommen werden
- Tenant-Admin kann ein Fahrzeug anlegen
- Tenant-User kann eine Reservierung anlegen

## Start

Einmalig Browser installieren:

```bash
npx playwright install chromium
```

Tests starten:

```bash
npm run test:e2e
```

Mit sichtbarem Browser:

```bash
npm run test:e2e:headed
```

## Technische Hinweise

- Die Tests verwenden eine isolierte SQLite-Datei unter `backend/data/fabu-e2e.db`.
- Vor jedem Testlauf werden die E2E-Testdaten neu erzeugt.
- Backend und Frontend werden von Playwright automatisch gestartet.
- Die produktive oder lokale Standarddatenbank `backend/data/fabu.db` wird dabei nicht verwendet, wenn `SQLITE_DB_PATH` gesetzt ist.