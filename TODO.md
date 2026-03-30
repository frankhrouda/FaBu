# FaBu TODO

## Produktionsstatus

- [x] PostgreSQL produktiv aktiv
- [x] Multi-Tenant-Isolation umgesetzt
- [x] Superadmin-Mandantenverwaltung umgesetzt
- [x] 502-Produktionsausfall beim Deploy behoben
- [x] Tenant-spezifische Kennzeichen-Constraints korrigiert

## Offen kurzfristig

- [ ] Letzten Admin eines Mandanten nicht entfernbar/degradierbar machen
- [ ] Dokumentation der echten API-Endpunkte auf Ist-Stand bringen
- [ ] Post-Release-Monitoring/Backup-Routinen dokumentieren
- [ ] Mandantenverwaltung um expliziten Fahrzeug-Refresh oder Detail-Endpoint erweitern

## Offen mittelfristig

- [ ] Audit-Logging für kritische Admin/Superadmin-Aktionen
- [ ] Automatisierte Smoke-Tests für Login, Fahrzeuge, Reservierungen, Mandantenverwaltung
- [ ] Staging-Checkliste und Rollback-Runbook ergänzen
- [ ] Mobile-App auf vollständigen Multi-Tenant-Ist-Stand prüfen

## Zuletzt abgeschlossen

- [x] Superadmin kann Mitglieder aus Mandanten entfernen
- [x] Superadmin kann Benutzer direkt in Mandanten anlegen
- [x] Admin-KM-Zusammenfassung für PostgreSQL repariert
- [x] Leere Seite in der Mandantenverwaltung durch Toast-Crash behoben
- [x] Fahrzeugbearbeitung bei tenant-übergreifend gleichem Kennzeichen repariert


