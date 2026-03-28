# FaBu Multi-Mandanten-Migration – Konzept & Roadmap

**Status:** Planungsphase  
**Datum:** März 2026  
**Scope:** Architekturelle Umgestaltung auf Multi-Mandanten-Unterstützung

---

## 📋 Executive Summary

Die FaBu-Anwendung wird von einem Single-Tenant- zu einem Multi-Tenant-System migriert. Dies ermöglicht:
- **Super-Admins**: Zugriff auf alle Mandanten und Daten
- **Mandanten-Admins**: Verwaltung nur ihres eigenen Mandanten
- **Normale User**: Zugriff nur auf Daten ihres Mandanten
- **Einladungssystem**: Registrierung nur mit Admin-Einladung pro Mandant

**Datensicherheit**: Strikte Isolation auf Datenbankebene – User eines Mandanten können technisch nicht auf andere Mandanten zugreifen.

---

## 🏗️ Architektur-Übersicht

### Aktuelle Struktur (Single-Tenant)
```
Tables:
  - users (id, name, email, password, role)
  - vehicles (id, name, license_plate, ...)
  - reservations (id, user_id, vehicle_id, ...)

Rollen: admin, user
Auth: JWT mit User-ID
```

### Zielstruktur (Multi-Tenant)
```
Tables:
  - tenants (id, name, created_by) ← NEW
  - tenant_members (tenant_id, user_id, role) ← NEW
  - invitation_codes (id, tenant_id, code, created_by) ← NEW
  - users (id, name, email, password)
  - vehicles (id, tenant_id, name, license_plate, ...) ← MODIFIED
  - reservations (id, user_id, vehicle_id, ...) ← UNCHANGED (FK via Vehicle)

Rollen: 
  - super_admin (global, nur in User)
  - tenant_admin (Mandanten-spezifisch)
  - user (Mandanten-spezifisch)

Auth: JWT mit User-ID + aktiver Mandant
```

---

## 🔄 Migrationsphasen

### **PHASE 1: Analyse & Vorbereitung** (3-4 Tage)
**Aufwand: ~20 Stunden**

#### 1.1 Datenbankschema-Design
- [Check] Entwerfen Sie die neuen Tabellen-Strukturen
- [Check] Dokumentieren Sie Foreign-Key-Beziehungen
- [Check] Planen Sie Indizes für Performance
- [Check] Planen Sie Fallback-Strategien

**Deliverables:**
- `MULTITENANT_SCHEMA.md` – Detailltes SQL-Schema
- Datenbankmigrationstest lokal

**Geschätzte Zeit: 4-5 Stunden**

---

#### 1.2 Bestehende Daten-Analyse
- Wie viele User, Vehicles, Reservations existieren?
- Existiert schon eine Hierarchie (Super-Admin)?
- Edge Cases identifizieren (Shared Vehicles, Cross-User Reservations?)

**Geschätzte Zeit: 2-3 Stunden**

---

#### 1.3 API & Frontend Impact-Analyse
- Welche Endpoints müssen angepasst werden?
- Welche UI-Komponenten benötigen Mandanten-Kontext?
- Welche Validierungsregeln ändern sich?

**Geschätzte Zeit: 4-5 Stunden**

---

#### 1.4 Sicherheitskonzept
- Row-Level-Security Strategie
- Injection-Protection bei Tenant-Kontext
- Audit-Logging für Admin-Aktionen

**Geschätzte Zeit: 3-4 Stunden**

---

### **PHASE 2: Datenbankmigrationen** (4-5 Tage)
**Aufwand: ~30 Stunden**

#### 2.1 SQLite & PostgreSQL Schema-Update
- Neue Tabellen erstellen:
  - `tenants`
  - `tenant_members`
  - `invitation_codes`
- Spalten hinzufügen:
  - `users`: `super_admin` BOOLEAN, `created_at`
  - `vehicles`: `tenant_id` INTEGER (NOT NULL mit FK)
  
**⚠️ WICHTIG:** Migration muss in BEIDEN SQLite & PostgreSQL erfolgen

**Geschätzte Zeit: 6-8 Stunden**

---

#### 2.2 Datenmigrationsskript
Erstellen Sie ein Migrationsskript `scripts/migrate-to-multitenant.js`:

```javascript
// Pseudo-Code-Logik:
1. Read all users from old schema
2. Create DEFAULT_TENANT (oder lesen Sie aus Config)
3. Move all existing users -> tenant_members with role='user'
4. Set first admin as super_admin=true
5. Assign all vehicles to DEFAULT_TENANT
6. Verify referential integrity
```

**Geschätzte Zeit: 6-8 Stunden**

---

#### 2.3 Testdaten für Entwicklung
- Erstellen Sie Test-Fixtures mit mehreren Mandanten
- 3-5 Test-Mandanten mit Usern, Fahrzeugen, Reservationen
- Load-Test mit Millionen von Reihen durchführen (später)

**Geschätzte Zeit: 4-5 Stunden**

---

#### 2.4 Rollback-Strategie dokumentieren
- Backup-Prozess vor Migration
- Schritt-für-Schritt Rollback-Anweisung
- Point-in-Time-Recovery Setup

**Geschätzte Zeit: 3-4 Stunden**

---

### **PHASE 3: Backend-API-Implementierung** (6-8 Tage)
**Aufwand: ~50 Stunden**

#### 3.1 Authentifizierung & Auth-Middleware (2-3 Tage / ~15-20 Stunden)

**Anpassungen in `middleware/auth.js`:**
- JWT-Payload erweitern: `{ id, super_admin, active_tenant_id }`
- Neue Middleware: `ensureTenantAccess()` – Prüft ob User im Mandant ist
- Neue Middleware: `ensureSuperAdmin()` – Nur Super-Admins
- Neue Middleware: `ensureTenantAdmin()` – Tenant-Admin oder Super-Admin

```javascript
// Beispiel JWT-Payload:
{
  id: 123,                    // User-ID
  super_admin: false,         // Is Super-Admin?
  active_tenant_id: 5,        // Aktuell gewählter Mandant
  name: "Max Mustermann",
  email: "max@example.com"
}
```

**Routes anpassen:**
- `POST /auth/login` – Rückgabe: `{ token, user, available_tenants }`
- `POST /auth/switch-tenant/:tenantId` – Tenant wechseln (neuer Token)
- Neue Route: `POST /auth/register-with-invite` – Registrierung mit Code

**Geschätzte Zeit: 6-8 Stunden**

---

#### 3.2 Registrierung & Einladungssystem (1-2 Tage / ~10-15 Stunden)

**Neue Routes:**

```
POST /invitations/create
  - Input: { tenant_id, email }
  - Auth: require TenantAdmin
  - Output: { code, expires_at }
  - Erstellt 6-stelligen alphanumerischen Code (24h Gültig)

POST /invitations/validate/:code
  - Input: {}
  - Auth: none
  - Output: { valid, tenant_name, expires_in }

POST /auth/register-with-invite
  - Input: { code, name, email, password }
  - Auth: none
  - Logic:
    1. Validiere Code + zeitbasiert
    2. Prüfe Email nicht existiert
    3. Hash Password
    4. Insert User
    5. Insert tenant_member (role='user')
    6. Mark einladungs-code as used
    7. Return JWT + user + tenant

POST /tenants/{tenantId}/recreate-invitations
  - Auth: require TenantAdmin of this tenant
  - Input: { email, expires_in_hours }
  - Output: { new_code }
```

**Geschätzte Zeit: 10-12 Stunden**

---

#### 3.3 Tenant-Management-APIs (2-3 Tage / ~15-20 Stunden)

**Super-Admin Routes:**
```
GET /admin/tenants
  - Rückgabe alle Mandanten + Statistik
  - Auth: require SuperAdmin

POST /admin/tenants
  - Erstelle neue Mandant
  - Input: { name, first_admin_email }
  - Auth: require SuperAdmin

DELETE /admin/tenants/:id
  - Lösche Mandant (mit Cascade?)
  - Auth: require SuperAdmin

GET /admin/tenants/:id/members
  - Alle User eines Mandanten
  - Auth: require SuperAdmin

PATCH /admin/tenants/:id/members/:userId/role
  - Ändere User-Rolle in Mandant
  - Auth: require SuperAdmin
```

**Tenant-Admin Routes:**
```
GET /tenants/{tenantId}/dashboard
  - Übersicht: User-Count, Vehicle-Count, Reservationen
  - Auth: require TenantAdmin of this tenant

GET /tenants/{tenantId}/members
  - Alle User meines Mandanten
  - Auth: require TenantAdmin of this tenant

PATCH /tenants/{tenantId}/members/:userId/role
  - Änderung nur zu 'admin' oder 'user'
  - Auth: require TenantAdmin, nur gleicher Mandant

DELETE /tenants/{tenantId}/members/:userId
  - Entfernung aus Mandant
  - Auth: require TenantAdmin of this tenant
```

**Geschätzte Zeit: 12-15 Stunden**

---

#### 3.4 Vehicles-API-Update (1-2 Tage / ~10-12 Stunden)

**Änderungen:**
- Alle `GET /vehicles` müssen `WHERE tenant_id = ?` filtern
- `POST /vehicles` – `tenant_id` vom Auth-Context
- Validierung: User darf nur Vehicles seines Mandanten sehen
- Admin darf Vehicles seines Mandanten verwalten

**Beispiel:**
```javascript
// Vorher
GET /vehicles
  SELECT * FROM vehicles WHERE active = 1

// Nachher
GET /vehicles
  SELECT * FROM vehicles 
  WHERE active = 1 
  AND tenant_id = ? (vom req.tenant_id)
```

**Geschätzte Zeit: 8-10 Stunden**

---

#### 3.5 Users-API-Update (1 Tag / ~8-10 Stunden)

**Änderungen:**
- `GET /users` – Nur User des aktuellen Mandanten
- Role-Change-Logik prüft Mandanten-Isolation
- Deletion entfernt aus `tenant_members`, nicht aus `users` (wegen Audit-Trail)

**Geschätzte Zeit: 6-8 Stunden**

---

#### 3.6 Reservations-API-Update (1 Tag / ~8-10 Stunden)

**Änderungen:**
- Implizite Tenant-Filterung über Vehicle-FK
- Validieren dass User & Vehicle im gleichen Mandant sind
- Abrechnung nur für Vehicles des eigenen Mandanten

**Geschätzte Zeit: 6-8 Stunden**

---

### **PHASE 4: Frontend-Anpassungen** (4-5 Tage)
**Aufwand: ~40 Stunden**

#### 4.1 Auth-Context & State-Management (1-2 Tage / ~12-15 Stunden)

**Anpassungen in `frontend/src/context/AuthContext.jsx`:**
- Extend Context mit `available_tenants`, `active_tenant_id`
- Neue Action: `switchTenant(tenantId)` – Ruft `/auth/switch-tenant` auf
- Login-Response verarbeitet nun `available_tenants`

```javascript
// Neuer Context:
const AuthContext = createContext({
  user: null,
  token: null,
  available_tenants: [],      // [{id, name, role}, ...]
  active_tenant_id: null,     // Current tenant
  isLoading: false,
  error: null,
  login: (email, password) => {},
  logout: () => {},
  switchTenant: (tenantId) => {},  // NEW
  // ...
});
```

**Geschätzte Zeit: 10-12 Stunden**

---

#### 4.2 Login & Tenant-Auswahl-UI (1 Tag / ~10-12 Stunden)

**Neue Komponenten:**
- `TenantSelector.jsx` – Dropdown/Modal zur Mandanten-Auswahl nach Login
- Anzeige: "Sie sind angemeldet als [Name] in Mandant: [Mandant-Name]"

**Pages-Update:**
- `Login.jsx` – Zeige Tenant-Auswahl NACH erfolgreicher Authentifizierung
- Falls nur 1 Mandant: Auto-Switch, kein UI nötig

**Geschätzte Zeit: 8-10 Stunden**

---

#### 4.3 Registrierung mit Einladung (1-2 Tage / ~12-15 Stunden)

**Neue Page:**
- `RegisterWithInvite.jsx`
  - URL: `/register?code=ABC123`
  - Eingaben: Name, Email, Passwort
  - Validierung: Code prüfen, Email-Duplikat prüfen
  - Nach Registrierung: Direkter Login + Auto-Switch zum Mandant

**Neue Komponenten:**
- `InvitationValidator.jsx` – Validiere Code bevor Seite laden

**Geschätzte Zeit: 10-12 Stunden**

---

#### 4.4 Admin-Panel für Tenant-Management (2-3 Tage / ~20-25 Stunden)

**Neue Pages:**
- `AdminTenantDashboard.jsx` (Super-Admin)
  - Liste aller Mandanten
  - Erstelle neue Mandanten
  - User-Management pro Mandant
  - Statistik pro Mandant

- `TenantAdminPanel.jsx` (Tenant-Admin)
  - User-Liste meines Mandanten
  - Rollen-Änderung
  - Einladungscodes generieren & verwalten
  - Fahrzeug-Verwaltung

**Neue Komponenten:**
- `InvitationCodeGenerator.jsx` – Button + Code + Copy-to-Clipboard
- `UserManagementTable.jsx` – User + Rollen-Änderung
- `TenantStatistics.jsx` – Stats-Karten

**Geschätzte Zeit: 18-22 Stunden**

---

#### 4.5 Vehicles & Reservationen (1-2 Tage / ~12-15 Stunden)

**Anpassungen:**
- `Vehicles.jsx` – Filtert automatisch nach `active_tenant_id`
- `Reservations.jsx` – Zeige nur Reservationen meines Mandanten
- Fahrzeug-Info zeigt Mandanten-Name (optional)

**Geschätzte Zeit: 10-12 Stunden**

---

#### 4.6 Layout & Navigation (0.5-1 Tag / ~6-8 Stunden)

**Anpassungen in `Layout.jsx`:**
- Tenant-Selector im Header/Sidebar
- Indikator: "Mandant: [Name]"
- Falls SuperAdmin: Link zu Tenant-Admin-Panel

**Geschätzte Zeit: 6-8 Stunden**

---

### **PHASE 5: Mobile-App-Anpassungen** (3-4 Tage)
**Aufwand: ~30-35 Stunden**

**Struktur identisch zu Frontend:**

#### 5.1 Auth-Context & Token-Management (1-2 Tage / ~10-12 Stunden)
- Update `mobile/src/auth/AuthContext.tsx`
- Tenant-Switching-Logik
- Lokales Storage: Speichere `active_tenant_id` per Device

---

#### 5.2 Login & Tenant-Auswahl (0.5-1 Tag / ~8-10 Stunden)
- `LoginScreen.tsx` – Nach Login Tenant-Auswahl Seite

---

#### 5.3 Registrierung mit Einladung (1 Tag / ~8-10 Stunden)
- `RegisterScreen.tsx` – Mit Einladungs-Code-Input
- Deep-Link Support: `fabu://register?code=ABC123`

---

#### 5.4 Navigation & UI-Updates (0.5-1 Tag / ~4-5 Stunden)
- RootNavigator.tsx – Tenant-Info anzeigen
- Settings: Tenant-Wechsel

**Geschätzte Zeit: 8-10 Stunden**

---

### **PHASE 6: API-Client-Library** (1-2 Tage)
**Aufwand: ~12-15 Stunden**

**Neue/Updated Client-Methoden:**
- `registerWithInvite(code, name, email, password)`
- `switchTenant(tenantId)`
- `createInvitationCode(email, expiresInHours)`
- `getTenantMembers(tenantId)`
- `updateUserRole(tenantId, userId, role)`
- Alle Endpoints automatisch mit Tenant-Filterung

**Beide Clients aktualisieren:**
- `frontend/src/api/client.js`
- `mobile/src/api/client.ts`

**Geschätzte Zeit: 10-12 Stunden**

---

### **PHASE 7: Testing & QA** (4-5 Tage)
**Aufwand: ~40-45 Stunden**

#### 7.1 Unit-Tests (1 Tag / ~8-10 Stunden)
- Auth-Middleware Tests
- Tenant-Filter-Logik Tests
- Einladungs-Code-Generation Tests

#### 7.2 Integration-Tests (2 Tage / ~15-20 Stunden)
- Login + Tenant-Switch Workflow
- Cross-Tenant-Isolation Test (Prüfe User A kann nicht User B's Data sehen)
- Reservierungen über Tenant-Grenzen sollten fehlschlagen

#### 7.3 Manual-Tests (1-2 Tage / ~12-15 Stunden)
- Alle Workflows durchspielen (Desktop, Mobile)
- Admin-Funktionen testen
- Edge Cases: Deleted Users, Expired Codes, concurrent Token-Refresh

#### 7.4 Load & Security Test (0.5 Tage / ~4-5 Stunden)
- SQL-Injection-Versuche gegen Tenant-Filter
- Performance-Test: 1000+ User, 100+ Vehicles pro Mandant

**Geschätzte Zeit: 35-40 Stunden**

---

### **PHASE 8: Datenmigration & Deployment Vorbereitung** (2-3 Tage)
**Aufwand: ~20-25 Stunden**

#### 8.1 Produktions-Migrationsplan
- Backup-Strategie
- Downtime-Fenster (30min–2h empfohlen)
- Rollback-Runbook

#### 8.2 Migrationstest im Staging
- Führen Sie alle Migrationsscripte aus
- Validieren Sie Daten-Integrität
- Test: Können alte User sich einloggen? → Sollte zu Default-Mandant gehen

#### 8.3 Dokumentation für Betrieb
- Neue Umgebungsvariablen (falls notig): `ENABLE_MULTITENANT=true`
- Admin-Handbook: Super-Admin vs. Tenant-Admin Pflichten
- User-Documentation: Wie spreche ich Mandanten-Admin an?

**Geschätzte Time: 18-22 Stunden**

---

### **PHASE 9: Deployment & Monitoring** (1-2 Tage)
**Aufwand: ~15-20 Stunden**

#### 9.1 Staged Rollout
- Canary: 10% Traffic auf neue Version
- Monitor: Fehlerrate, Latenz, Datenbank-Performance
- Nach 1h: 50%, dann 100%

#### 9.2 Monitoring & Alerts
- Alert bei Tenant-ID-Mismatches (Security!)
- Alert bei Migrationsfehler
- Datenbank-Query-Logs auf Cross-Tenant-Queries prüfen

#### 9.3 Rollback-Szenarie
- DB-Rollback-Script testen
- API-Fallback-Logic (bei unfixed Bugs)

**Geschätzte Zeit: 12-15 Stunden**

---

## 📊 Zeit-Schätzungen Zusammenfassung

| Phase | Beschreibung | Geschätzter Aufwand |
|-------|-------------|-----|
| **Phase 1** | Analyse & Vorbereitung | ~20 Stunden |
| **Phase 2** | Datenbankmigrationen | ~30 Stunden |
| **Phase 3** | Backend-API-Impl. | ~50 Stunden |
| **Phase 4** | Frontend-Anpassungen | ~40 Stunden |
| **Phase 5** | Mobile-App-Anpassungen | ~30-35 Stunden |
| **Phase 6** | API-Client-Library | ~12-15 Stunden |
| **Phase 7** | Testing & QA | ~40-45 Stunden |
| **Phase 8** | Datenmigration & Vorbereitung | ~20-25 Stunden |
| **Phase 9** | Deployment & Monitoring | ~15-20 Stunden |
| **TOTAL** | | **~257-280 Stunden** |

**Kalender-Zeit:** ~8–10 Wochen @ 30–35 Stunden/Woche (mit 1-2 Dev)

---

## 🔐 Sicherheitsüberlegungen

### Tenant-Isolation (CRITICAL)

#### 1. **Datenbank-Ebene**
```sql
-- IMMER WHERE tenant_id = $1 filtern
SELECT * FROM vehicles 
WHERE tenant_id = $1 AND user_id = $2;
```

#### 2. **API-Middleware-Ebene**
```javascript
// Jeder protected Endpoint MUST:
1. req.tenant_id aus Token extrahieren
2. Ressource laden
3. Prüfen: resource.tenant_id === req.tenant_id
4. Falls nicht match: 403 Forbidden

// ❌ FALSCH:
GET /users/:id - nur ID prüfen

// ✅ RICHTIG:
GET /tenants/:tenantId/users/:id
  - Verif: req.tenant_id === tenantId
  - Verif: user.tenant_id === tenantId (Datenbank)
  - Return user
```

#### 3. **JWT-Payload-Validierung**
```javascript
// JWT muss:
- Immer super_admin Flag haben
- Immer active_tenant_id haben
- Vor jedem Request gegen DB re-validieren 
  (User könnte aus Mandant entfernt sein)
```

### Audit-Logging

```javascript
// Alle Admin-Aktionen müssen logged werden:
- Tenant erstellt
- User hinzugefügt/entfernt
- Rolle geändert
- Einladungs-Code generiert
- Vehicle erstellt/gelöscht

CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY,
  admin_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id INTEGER,
  tenant_id INTEGER,
  changes JSON,
  created_at DATETIME
);
```

### SQL-Injection Prevention
- **Immer** Prepared Statements nutzen
- Tenant-ID aus JWT entnehmen, NICHT aus Request-Body
- Validiere Parameter bevor DB-Query

---

## 🚀 Empfohlene Vorgehensweise

### Option A: Schrittweise Migration (EMPFOHLEN)
1. **Phase 1–2** abschließen (Planung + DB-Schema)
2. **Phase 3** – Backend implementieren + testen lokal
3. **Phase 4–5** – Frontend & Mobile anpassen
4. **Phase 7** – Intensive QA
5. **Phase 8–9** – Production-Rollout

**Vorteil:** Low-Risk, inkrementelle Validierung

---

### Option B: Parallel Workstreams (wenn mehrere Devs verfügbar)
- **Dev 1:** Phase 3 (Backend API)
- **Dev 2:** Phase 4 (Frontend React)
- **Dev 3:** Phase 5 (Mobile React-Native)
- **Dev 4:** Phase 2 (DB Migrations & Scripts)

**Vorteil:** Schneller, **Risiko:** Integrationsprobleme, braucht klare Schnittstellen

---

## ⚠️ Kritische Achillesverse

1. **Tenant-ID-Isolation aktualisieren**
   - Vergessener WHERE-Filter = Datenleck!
   - Empfehlung: Code-Review Checklist für jeden neuen Endpoint

2. **Datenmigration**
   - Welche Fahrzeuge gehören zu welchem Mandant?
   - Hypothese: Alle bestehenden Fahrzeuge → DEFAULT_TENANT
   - Validierung: Keine Reservierungen über Tenant-Grenzen

3. **User-Experience beim Rollout**
   - Alte Clients (noch nicht geupgradet) funktionieren nicht mehr
   - Empfehlung: API-Versionierung oder Graceful-Fallback

4. **Indizes auf Tenant-Spalten**
```sql
-- WICHTIG für Performance:
CREATE INDEX idx_vehicles_tenant_id ON vehicles(tenant_id);
CREATE INDEX idx_tenant_members_tenant_id ON tenant_members(tenant_id);
CREATE INDEX idx_reservations_vehicle_tenant ON reservations(vehicle_id, user_id);
```

---

## 📋 Umzusetzende Detaildokumente

Nachdem dieses Konzept genehmigt ist, erstellen Sie:

1. **`MULTITENANT_SCHEMA.md`** – Exaktes SQL-Schema, Migration Path
2. **`TENANT_SECURITY_SPEC.md`** – Sicherheitsregeln pro Endpoint
3. **`TENANT_API_CONTRACT.md`** – Neue/geänderte Endpoints mit Beispielen
4. **`MIGRATION_RUNBOOK.md`** – Step-by-Step Anleitung für Production
5. **`TESTING_CHECKLIST.md`** – Test-Cases für QA
6. **`ADMIN_HANDBOOK.md`** – Dokumentation für Super-Admin & Tenant-Admin

---

## 🗓️ Grobroadmap

```
Woche 1–2:   Phase 1–2  (Analyse, DB-Migration-Script)
Woche 3–4:   Phase 3    (Backend API)
Woche 5–6:   Phase 4–5  (Frontend, Mobile)
Woche 7:     Phase 6–7  (API-Client, Testing)
Woche 8–9:   Phase 8–9  (Production-Prep, Rollout)
```

**Total: ~8–10 Wochen mit 1 Senior Dev + 1-2 Junior Devs**

---

## ✅ Nächste Schritte

1. [ ] Review & Approval dieses Konzepts durch Stakeholder
2. [ ] Erstelle `MULTITENANT_SCHEMA.md` mit exaktem SQL
3. [ ] Starten Sie Phase 1 (Datenbankdesign-Details)
4. [ ] Evaluieren Sie Datenmigrationsstrategie (Bestandsdaten)
5. [ ] Planen Sie Entwickler-Ressourcen & Timeline

---

**Dokument-Status:** DRAFT – Bereit zur Diskussion  
**Autor:** Development Team  
**Letztes Update:** März 2026
