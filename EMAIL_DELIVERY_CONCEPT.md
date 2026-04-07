# FaBu E-Mail-Konzeption (Postausgang)

Stand: 2026-04-04

## 1. Ziel und Rahmenbedingungen

Diese Konzeption beschreibt den technischen Versand von transaktionalen E-Mails in FaBu.

Ziele:
- moeglichst wartungsfrei
- im Start moeglichst kostenlos
- sicher und professionell
- spaeter skalierbar ohne Architekturbruch

Nicht-Ziel:
- Betrieb eines eigenen klassischen Mailservers (MTA) mit eigener IP-Reputation.

## 2. Anforderungen fuer FaBu

### 2.1 Funktionale Anforderungen
- Versand bei klaren Events (z. B. Registrierung, Passwort-Reset, Reservierungsereignisse, Admin-Anfragen).
- Mandantenfaehige Inhalte (Tenant-Name, ggf. tenant-spezifische Footer/Absender).
- Nachvollziehbarer Versandstatus (gesendet, fehlgeschlagen, gebounced).

### 2.2 Nicht-funktionale Anforderungen
- Hohe Zustellbarkeit (SPF, DKIM, DMARC, Suppression-Handling).
- Entkopplung vom Request-Response-Pfad (kein Blockieren von API-Endpunkten).
- Wiederholversuche bei temporaeren Fehlern.
- DSGVO-konforme Datenminimierung.

## 3. Optionenanalyse Postausgang

### Option A: Eigener SMTP-Server (Postfix/Exim/Mailcow)
Vorteile:
- Volle technische Kontrolle.

Nachteile:
- Hoher Betriebsaufwand (Patching, Abuse-Handling, Monitoring, Backup, MTA-Feintuning).
- Schwierige Zustellbarkeit ohne etablierte IP-Reputation.
- Hohes Risiko fuer Blacklisting und Spam-Einstufung.

Bewertung:
- Nicht geeignet fuer das Ziel wartungsfrei + professionell.

### Option B: SMTP eines normalen Mailpostfachs
Vorteile:
- Schnell eingerichtet.

Nachteile:
- Harte Versandlimits.
- Nicht fuer transaktionale App-Mails optimiert.
- Risiko von Sperren bei atypischem Versandmuster.

Bewertung:
- Nur als kurzfristige Notloesung.

### Option C: Transactional E-Mail-Provider (API oder SMTP Relay)
Vorteile:
- Sehr geringer Betriebsaufwand.
- Professionelle Zustellinfrastruktur.
- Webhooks fuer Delivery/Bounce/Complaint.
- Free-Tiers fuer Startvolumen verfuegbar.

Nachteile:
- Anbieterabhaengigkeit (durch Adapter aber beherrschbar).
- Free-Tier-Limits.

Bewertung:
- Empfohlene Standardloesung fuer FaBu.

## 4. Empfohlene Zielarchitektur

## 4.1 Architekturprinzip
- Business-Logik erzeugt Mail-Events.
- Ein dedizierter MailWorker versendet asynchron.
- Provider wird ueber ein abstrahiertes Interface angebunden.
- Rueckmeldungen (Bounce/Complaint) kommen ueber Webhook zurueck.

## 4.2 Komponenten
1. MailService Interface
- send(eventType, recipient, payload, options)
- Keine Providerdetails in Routen/Use-Cases.

2. Provider-Adapter
- Primary Adapter (z. B. Resend, Mailgun, Brevo, Postmark).
- Optional Secondary Adapter als Fallback.

3. Outbox/Queue
- Persistente Tabelle in DB statt fire-and-forget.
- Statusmodell: pending, sending, sent, failed, bounced, suppressed.

4. MailWorker
- Pollt pending Jobs.
- Exponentielles Retry bei temporaeren Fehlern.
- Dead-letter Markierung nach MaxAttempts.

5. Webhook Endpoint
- Verifiziert Signatur des Providers.
- Schreibt Delivery/Bounce/Complaint-Status in DB.
- Pflegt Suppression-Liste.

6. Template Layer
- Versionierte Templates pro Event.
- Optional i18n fuer Deutsch/Englisch.

## 4.3 Datenmodellvorschlag (DB-neutral)

Tabelle: mail_outbox
- id (PK)
- tenant_id (FK, nullable bei systemweiten Mails)
- event_type (TEXT)
- recipient_email (TEXT)
- recipient_user_id (FK, nullable)
- subject (TEXT)
- payload_json (TEXT/JSON)
- status (TEXT)
- provider (TEXT)
- provider_message_id (TEXT)
- attempt_count (INT)
- next_attempt_at (TIMESTAMP)
- last_error (TEXT)
- created_at (TIMESTAMP)
- sent_at (TIMESTAMP, nullable)

Tabelle: mail_suppressions
- id (PK)
- email (TEXT, UNIQUE)
- reason (TEXT: bounce, complaint, manual)
- source_provider (TEXT)
- created_at (TIMESTAMP)

Tabelle: mail_events
- id (PK)
- outbox_id (FK)
- event (TEXT: delivered, deferred, bounced, complained, opened, clicked)
- raw_payload_json (TEXT/JSON)
- created_at (TIMESTAMP)

Hinweis fuer FaBu:
- Da FaBu SQLite und PostgreSQL unterstuetzt, sollte das Schema in beiden Varianten angelegt werden (analog zu bestehender DB-Strategie in backend/src/db/client.js).

## 5. Sicherheits- und Compliance-Konzept

Pflichtmassnahmen:
1. SPF korrekt fuer den gewaehlten Provider.
2. DKIM aktiv (mindestens 1024, besser 2048 Bit wenn unterstuetzt).
3. DMARC starten mit p=none + Reporting, spaeter auf quarantine/reject erhoehen.
4. API Keys nur als Secrets (env), nie im Repo.
5. Webhook-Signatur pruefen, Requests ohne gueltige Signatur verwerfen.
6. Keine sensiblen Daten (Passwoerter, Tokens im Klartext) per E-Mail versenden.
7. Logging minimieren: keine personenbezogenen Inhalte vollstaendig loggen.

## 6. Kosten- und Betriebsstrategie

### Phase 1 (0 EUR Ziel)
- Managed Provider mit Free-Tier.
- Ein Provider, kein Multi-Provider-Setup.
- Fokus auf korrekte Domain-Authentifizierung und Monitoring.

### Phase 2 (Wachstum)
- Bei Erreichen von Limits Wechsel auf guenstigen Paid-Plan.
- Optional zweiter Provider nur fuer Failover kritischer Mails (z. B. Reset).

### Warum das professionell bleibt
- Professionelle Zustellung entsteht durch DNS-Authentifizierung, saubere Event-Verarbeitung und Suppression-Management, nicht durch einen selbst betriebenen SMTP-Server.

## 7. Empfehlung fuer FaBu

Primär: Transactional Provider per API anbinden.

Begruendung:
- Wenig Wartung.
- Gute Deliverability.
- Robuste Statusrueckmeldung via Webhooks.
- Saubere Skalierung ohne Neudesign.

### 7.1 Shortlist geeigneter Provider

FaBu sollte bewusst nur diese drei Provider evaluieren:

1. Resend
- Sehr gute Developer Experience.
- Klare API, SMTP Relay, Webhooks und gute Dokumentation.
- Free-Tier laut Anbieter derzeit: 3.000 E-Mails/Monat, 100 pro Tag.
- Gut geeignet fuer produktnahe transaktionale Mails mit wenig Integrationsaufwand.
- Einschraenkung: eher moderner Developer-Fokus als klassischer Enterprise/EU-Plattform-Fokus.

2. Brevo
- Etablierter Anbieter mit starkem Europa- und DSGVO-Fokus.
- SMTP und API verfuegbar, breite Marktakzeptanz.
- Free-Tier laut Anbieter derzeit: kostenloser Einstieg, transaktionaler Versand enthalten; fuer geringe Mengen gut geeignet.
- Gut geeignet, wenn Datenschutz, etablierter Anbieter und langfristige kaufmaennische Soliditaet wichtig sind.
- Einschraenkung: Produkt ist breiter und etwas schwergewichtiger als ein rein technischer Transactional-Anbieter.

3. Mailjet
- Langjaehrig etablierter und vertrauenswuerdiger Anbieter.
- API, SMTP Relay und Webhooks bereits im Free-Tier.
- Free-Tier laut Anbieter derzeit: 6.000 E-Mails/Monat, 200 pro Tag.
- Gut geeignet als konservative Alternative mit solider Basisfunktionalitaet.
- Einschraenkung: Developer Experience meist weniger schlank als bei Resend.

### 7.2 Nicht in die engere Auswahl
- Postmark: sehr professionell, aber in der Regel kein echter dauerhafter Free-Tier.
- Mailgun: technisch stark, aber fuer das Ziel kostenlos bei geringer Menge meist weniger passend.
- AWS SES: sehr serioes und guenstig, aber operativ und konzeptionell nicht die wartungsarmste Startoption.

### 7.3 Empfohlene Reihenfolge fuer FaBu

1. Resend pruefen, wenn Einfachheit und schnelle Integration Prioritaet haben.
2. Brevo pruefen, wenn EU-/DSGVO-Naehe und etablierter Plattformbetrieb Prioritaet haben.
3. Mailjet nur als dritte Vergleichsoption mitnehmen.

### 7.4 Vorlaeufige Auswahlentscheidung

Wenn FaBu heute starten wuerde, waere die pragmatische Entscheidung:
- Erstwahl: Resend
- Zweitwahl: Brevo

Begruendung:
- Resend ist fuer ein schlankes Node.js-Backend mit Outbox/Worker-Ansatz sehr passend.
- Brevo ist die sichere Alternative, falls ein staerkerer Europa-/Compliance-Fokus oder ein konservativerer Anbietereindruck bevorzugt wird.
- Beide sind fuer geringe Versandmengen deutlich sinnvoller als ein selbst betriebener SMTP-Server.

### 7.5 Entscheidungsmatrix: Resend vs. Brevo

Bewertungsskala:
- 1 = schwach
- 3 = solide
- 5 = sehr gut

| Kriterium | Resend | Brevo | Einordnung fuer FaBu |
| --- | --- | --- | --- |
| Integrationsaufwand im Node.js-Backend | 5 | 4 | Resend ist meist schneller produktiv integriert. |
| API-Qualitaet und Developer Experience | 5 | 3 | Resend ist klar developer-zentrierter. |
| SMTP-Relay als Fallback | 5 | 5 | Beide koennen API und SMTP. |
| Webhooks fuer Delivery/Bounce/Complaint | 5 | 5 | Fuer Outbox + Rueckkanal sind beide geeignet. |
| Free-Tier fuer kleine Mengen | 4 | 4 | Beide sind fuer Startvolumen brauchbar; Limits vor Vertragsentscheidung erneut pruefen. |
| Klarheit des Pricings | 5 | 3 | Resend ist transparenter, Brevo hat eine breitere und dadurch unruhigere Preisstruktur. |
| DSGVO-/Europa-Naehe | 3 | 5 | Brevo wirkt hier fuer europaeische Business-Kontexte staerker. |
| Vertrauenswuerdigkeit / Marktetablierung | 4 | 5 | Brevo ist aelter und breiter im Markt verankert. |
| Produktfokus auf transaktionale Mails | 5 | 4 | Resend ist fokussierter, Brevo ist breiter aufgestellt. |
| Wartungsarmut im operativen Betrieb | 5 | 4 | Beide sind wartungsarm; Resend wirkt fuer den Start minimal einfacher. |
| Eignung fuer FaBu-Startsetup | 5 | 4 | Fuer euer aktuelles Setup ist Resend leicht vorne. |

Gesamtbild:
- Resend ist die beste Erstwahl, wenn schnelle technische Umsetzung, einfache API-Nutzung und geringer Integrationsaufwand Prioritaet haben.
- Brevo ist die bessere Wahl, wenn Compliance-Wahrnehmung, Europa-Naehe und ein etablierterer Business-Anbieter staerker gewichtet werden.

### 7.6 Praktische Entscheidung fuer FaBu

Empfehlung:
- Standardfall: Resend verwenden.
- Alternative: Brevo verwenden, wenn ihr bewusst den staerkeren EU-/DSGVO-Fokus priorisiert.

Konkret bedeutet das:
- Wenn ihr in den naechsten Wochen ein MVP fuer transaktionale Mails bauen wollt, spart Resend wahrscheinlich die meiste Zeit.
- Wenn der Versand frueh in Beschaffungs-, Datenschutz- oder Kundenpruefungen erklaerbar und konservativ wirken soll, ist Brevo leichter zu vertreten.

### 7.7 Minimales Evaluationsverfahren

FaBu sollte nicht mehr als zwei Anbieter praktisch testen:

1. Resend als technische Referenzintegration.
2. Brevo nur als Gegenprobe fuer Compliance-, Preis- und Betriebsbewertung.

Pro Anbieter reichen fuer die Entscheidung diese Checks:
- Domain-Verifikation mit SPF, DKIM und Return-Path.
- Versand von 3 Mailtypen: Welcome, Passwort-Reset, Reservierungsbenachrichtigung.
- Webhook-Test fuer delivered, bounced und complained.
- Sichtpruefung in Gmail, Outlook und GMX/Web.de.
- Aufwand messen: Zeit bis erste produktionsreife Mail.

### 7.8 Stand der Free-Tier-Angaben

Bei Erstellung dieser Konzeption wurden offizielle Pricing-Seiten der Anbieter geprueft.

Fest verifiziert:
- Resend: 3.000 E-Mails/Monat, 100/Tag.
- Mailjet: 6.000 E-Mails/Monat, 200/Tag.

Bei Brevo war auf der geprueften Pricing-Seite der kostenlose Einstieg klar erkennbar, die genaue Free-Tier-Grenze fuer den hier relevanten Transaktionsfall wurde dort aber nicht gleichwertig klar ausgewiesen.
Daher sollte Brevo vor finaler Auswahl noch einmal direkt gegen die aktuelle offizielle Preis- und Limitdarstellung verifiziert werden.

## 8. Konkrete Umsetzungsschritte (priorisiert)

1. Domain vorbereiten
- Subdomain festlegen, z. B. mail.fabu-online.de als Sending Domain.
- SPF/DKIM/DMARC Records setzen.

2. Backend-Struktur erweitern
- Neuer Bereich backend/src/mail/ mit:
  - MailService (Interface)
  - ProviderAdapter
  - TemplateRenderer
  - MailWorker

3. DB-Schema erweitern
- Tabellen mail_outbox, mail_suppressions, mail_events in SQLite + PostgreSQL ergaenzen.

4. API-seitige Event-Erzeugung
- Bei relevanten Use-Cases nur Outbox-Eintrag erstellen.
- Kein Direktversand aus Request-Handlern.

5. Worker-Start integrieren
- Worker als separater Prozess oder im Backend-Prozess mit klarer Lifecycle-Steuerung.

6. Webhook-Route integrieren
- backend/src/routes/mailWebhook.js
- Signaturvalidierung + Eventpersistenz.

7. Observability
- Metriken: success_rate, bounce_rate, avg_retry_count, time_to_send.
- Alerts bei auffaelligen Fehler- oder Bounce-Raten.

8. Teststrategie
- Unit-Tests fuer Retry-Logik und Statusuebergaenge.
- Integrationstests mit Provider-Mock.
- E2E Smoke-Test fuer mindestens einen kritischen Mailflow (z. B. Passwort-Reset).

## 9. Mail-Events fuer den Startumfang

Empfohlene initiale Events:
- auth.registered.welcome
- auth.password_reset.requested
- reservation.created
- reservation.updated
- reservation.cancelled
- tenant_admin_request.submitted

Backlog (spaeter umsetzen):
- waitlist.offer.created

Alle Events sollten tenant_id und correlation_id tragen, damit Vorgaenge nachvollziehbar bleiben.

## 10. Betriebscheckliste

- SPF/DKIM/DMARC validiert
- Bounce/Complaint Webhooks aktiv
- Suppression-Liste aktiv
- Retries + Dead-letter aktiv
- Monitoring + Alerting aktiv
- Impressum/Datenschutz in Mail-Footer verlinkt

## 11. Kurzentscheidung

FaBu sollte keinen eigenen SMTP-Server betreiben.
Die passende Loesung ist ein Managed Transactional E-Mail-Provider mit Outbox + Worker + Webhook-Rueckkanal.
So bleibt der Versand wartungsarm, professionell und im Start mit Free-Tier meist kostenneutral.
