# Multi-Tenant Datenbankschema – Detailspezifikation

**Gültig für:** SQLite & PostgreSQL  
**Version:** 1.0  
**Status:** DESIGN

---

## 📐 Schema-Übersicht

```
Tabellen-Struktur:

tenants (neu)
  ├─ id
  ├─ name
  ├─ created_by (Fremdschlüssel: users.id)
  ├─ created_at
  └─ (optional) metadata JSON

tenant_members (neu) – Mapping Users <-> Tenants
  ├─ id
  ├─ tenant_id (Fremdschlüssel: tenants.id)
  ├─ user_id (Fremdschlüssel: users.id)
  ├─ role (enum: 'admin', 'user')
  └─ created_at

invitation_codes (neu) – Registrierungs-Einladungen
  ├─ id
  ├─ tenant_id (Fremdschlüssel: tenants.id)
  ├─ code (unique, 6–8 stellig alphanumerisch)
  ├─ email (optional, wenn Email-spezifisch)
  ├─ created_by (Fremdschlüssel: users.id)
  ├─ used_by (Fremdschlüssel: users.id, NULL = ungenutzt)
  ├─ expires_at (DATETIME)
  ├─ created_at
  └─ used_at (DATETIME, NULL = nicht genutzt)

users (verändert)
  ├─ id
  ├─ name
  ├─ email (unique)
  ├─ password
  ├─ super_admin (BOOLEAN, default FALSE)
  └─ created_at

vehicles (verändert – tenant_id hinzugefügt)
  ├─ id
  ├─ tenant_id (Fremdschlüssel: tenants.id) << NEU, NOT NULL
  ├─ name
  ├─ license_plate (unique pro tenant!)
  ├─ type
  ├─ description
  ├─ price_per_km
  ├─ flat_fee
  ├─ active (BOOLEAN)
  └─ created_at

reservations (unverändert, implizite Tenant durch Vehicle)
  ├─ id
  ├─ user_id (Fremdschlüssel: users.id)
  ├─ vehicle_id (Fremdschlüssel: vehicles.id)
  ├─ date
  ├─ date_to
  ├─ time_from
  ├─ time_to
  ├─ reason
  ├─ km_driven
  ├─ destination
  ├─ status
  └─ created_at

audit_logs (neu, optional aber empfohlen für Admin-Aktionen)
  ├─ id
  ├─ tenant_id (Fremdschlüssel: tenants.id)
  ├─ admin_id (Fremdschlüssel: users.id)
  ├─ action (TEXT: 'INVITE_CREATED', 'USER_ROLE_CHANGED', etc.)
  ├─ resource_type (TEXT: 'user', 'vehicle', 'tenant', etc.)
  ├─ resource_id (INTEGER, kann NULL sein)
  ├─ changes (JSON: {before: {}, after: {}})
  ├─ ip_address (optional)
  └─ created_at
```

---

## SQL-Statements

### SQLite Version

```sql
-- ============================================
-- NEUE TABELLEN
-- ============================================

-- 1. TENANTS
CREATE TABLE IF NOT EXISTS tenants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_by INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- 2. TENANT_MEMBERS (Zuordnung User <-> Tenant + Role)
CREATE TABLE IF NOT EXISTS tenant_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  
  UNIQUE(tenant_id, user_id)  -- User kann nur 1x pro Tenant sein
);

-- 3. INVITATION_CODES
CREATE TABLE IF NOT EXISTS invitation_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL,
  code TEXT NOT NULL UNIQUE,  -- 6–8 stellig alphanumerisch
  email TEXT,  -- Optional: wenn Email-spezifisch
  created_by INTEGER NOT NULL,
  used_by INTEGER,  -- NULL = noch nicht verwendet
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  used_at DATETIME,  -- NULL = noch nicht verwendet
  
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (used_by) REFERENCES users(id) ON DELETE SET NULL
);

-- 4. AUDIT_LOGS (Optional, für Sicherheit & Compliance)
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER,  -- NULL für Super-Admin Aktionen
  admin_id INTEGER NOT NULL,
  action TEXT NOT NULL,  -- z.B. 'INVITE_CREATED', 'USER_ROLE_CHANGED'
  resource_type TEXT,
  resource_id INTEGER,
  changes TEXT,  -- JSON als Text (SQLite hat kein JSON)
  ip_address TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL,
  FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================
-- MODIFIZIERTE TABELLEN
-- ============================================

-- 5. USERS (Neue Spalten)
-- Migration: Siehe ALTER-Statements unten
ALTER TABLE users ADD COLUMN super_admin INTEGER DEFAULT 0;  -- BOOLEAN (0|1 in SQLite)

-- 6. VEHICLES (Neue Spalte)
-- Migration: Siehe ALTER-Statements unten
ALTER TABLE vehicles ADD COLUMN tenant_id INTEGER;

-- ============================================
-- INDIZES für Performance
-- ============================================

CREATE INDEX idx_tenants_created_by ON tenants(created_by);

CREATE INDEX idx_tenant_members_tenant_id ON tenant_members(tenant_id);
CREATE INDEX idx_tenant_members_user_id ON tenant_members(user_id);

CREATE INDEX idx_invitation_codes_tenant_id ON invitation_codes(tenant_id);
CREATE INDEX idx_invitation_codes_code ON invitation_codes(code);
CREATE INDEX idx_invitation_codes_expires_at ON invitation_codes(expires_at);

CREATE INDEX idx_vehicles_tenant_id ON vehicles(tenant_id);
CREATE INDEX idx_vehicles_active_tenant ON vehicles(active, tenant_id);

CREATE INDEX idx_audit_logs_tenant_id ON audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_admin_id ON audit_logs(admin_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
```

### PostgreSQL Version

```sql
-- ============================================
-- NEUE TABELLEN (PostgreSQL)
-- ============================================

-- 1. TENANTS
CREATE TABLE IF NOT EXISTS tenants (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. TENANT_MEMBERS
CREATE TABLE IF NOT EXISTS tenant_members (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(tenant_id, user_id)
);

-- 3. INVITATION_CODES
CREATE TABLE IF NOT EXISTS invitation_codes (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code VARCHAR(12) NOT NULL UNIQUE,
  email VARCHAR(255),
  created_by INTEGER NOT NULL REFERENCES users(id),
  used_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  used_at TIMESTAMP
);

-- 4. AUDIT_LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
  admin_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50),
  resource_id INTEGER,
  changes JSONB,
  ip_address INET,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- MODIFIZIERE BESTEHENDE TABELLEN
-- ============================================

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS super_admin BOOLEAN DEFAULT FALSE;

ALTER TABLE vehicles 
ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);

-- ============================================
-- INDIZES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_tenants_created_by ON tenants(created_by);
CREATE INDEX IF NOT EXISTS idx_tenant_members_tenant_id ON tenant_members(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_members_user_id ON tenant_members(user_id);
CREATE INDEX IF NOT EXISTS idx_invitation_codes_tenant_id ON invitation_codes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invitation_codes_code ON invitation_codes(code);
CREATE INDEX IF NOT EXISTS idx_invitation_codes_expires_at ON invitation_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_vehicles_tenant_id ON vehicles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_active_tenant ON vehicles(active, tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_id ON audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
```

---

## 🔄 Migrationsstrategie für Bestandsdaten

### Szenario: Bestehende Single-Tenant-Daten migrieren

```javascript
// scripts/migrate-to-multitenant.js (Pseudo-Code)

async function migrateToMultitenant() {
  // 1. Erstelle DEFAULT_TENANT oder lese aus ENV
  const DEFAULT_TENANT_NAME = process.env.DEFAULT_TENANT_NAME || 'Default Organization';
  
  const firstAdmin = db.queryOne(
    'SELECT id FROM users WHERE role = ? ORDER BY created_at LIMIT 1',
    ['admin']
  );
  
  if (!firstAdmin) {
    throw new Error('No admin user found. Cannot create default tenant.');
  }
  
  // 2. Erstelle Tenant
  const tenantId = db.execute(
    'INSERT INTO tenants (name, created_by) VALUES (?, ?)',
    [DEFAULT_TENANT_NAME, firstAdmin.id]
  ).lastInsertId;
  
  // 3. Migriere alle Users -> tenant_members
  const allUsers = db.queryMany('SELECT id FROM users', []);
  
  for (const user of allUsers) {
    db.execute(
      'INSERT INTO tenant_members (tenant_id, user_id, role) ' +
      'SELECT ?, id, role FROM users WHERE id = ?',
      [tenantId, user.id]
    );
  }
  
  // 4. Weise alle Vehicles dem Tenant zu
  db.execute(
    'UPDATE vehicles SET tenant_id = ?',
    [tenantId]
  );
  
  // 5. Setze ersten Admin als super_admin
  db.execute(
    'UPDATE users SET super_admin = 1 WHERE id = ?',
    [firstAdmin.id]
  );
  
  // 6. Validiere referenzielle Integrität
  const vehiclesWithoutTenant = db.queryMany(
    'SELECT id FROM vehicles WHERE tenant_id IS NULL', []
  );
  
  if (vehiclesWithoutTenant.length > 0) {
    throw new Error(`${vehiclesWithoutTenant.length} vehicles missing tenant_id!`);
  }
  
  const usersWithoutTenantMembership = db.queryMany(
    'SELECT u.id FROM users u LEFT JOIN tenant_members tm ON u.id = tm.user_id ' +
    'WHERE tm.id IS NULL', []
  );
  
  if (usersWithoutTenantMembership.length > 0) {
    throw new Error(`${usersWithoutTenantMembership.length} users missing tenant_members entry!`);
  }
  
  console.log(`✓ Migration completed. Tenant ID: ${tenantId}, Name: ${DEFAULT_TENANT_NAME}`);
}
```

### Edge Cases zu berücksichtigen

1. **Vehicles ohne Tenant vor Migration**
   - Lösung: Assign all zu DEFAULT_TENANT
   - Fallback: Lösche Fahrzeuge (wenn keine Reservierungen)

2. **Orphaned Reservations** (Vehicle/User existiert nicht mehr)
   - Lösung: Backup alte Reservations, lösche Orphans
   - TIPP: Vor Migration vollständiges Backup machen

3. **Mehrere Admins existieren bereits**
   - Alle als super_admin setzen? Oder nur der älteste?
   - **Empfehlung:** Konfigurierbar via `INITIAL_SUPER_ADMINS=[id1,id2,...]`

---

## 🔐 Constraint-Regeln

### Tenant-Isolation auf Datenbankebene

```sql
-- IMMER, wenn Sie auf Vehicles zugreifen:
SELECT v.* FROM vehicles v
WHERE v.tenant_id = ?  -- Tenant-ID aus JWT

-- FALSCH ❌:
SELECT * FROM vehicles WHERE id = ?  -- Keine Tenant-Filter!

-- RICHTIG ✅ (mit Doppel-Validierung):
SELECT v.* FROM vehicles v
WHERE v.id = ? AND v.tenant_id = ?

-- FALSCH ❌:
SELECT * FROM reservations WHERE user_id = ?  -- User könnte in mehreren Tenants sein!

-- RICHTIG ✅ (Filter durch Vehicle-Tenant):
SELECT r.* FROM reservations r
JOIN vehicles v ON r.vehicle_id = v.id
WHERE r.user_id = ? AND v.tenant_id = ?
```

### Unique-Constraints

```sql
-- license_plate ist UNIQUE pro Tenant, nicht global!
CREATE UNIQUE INDEX idx_vehicles_license_plate_tenant 
ON vehicles(license_plate, tenant_id)
WHERE tenant_id IS NOT NULL;

-- email ist global unique (User existiert nur once)
-- aber User kann in mehreren Tenants sein

-- invitation_code ist global unique (nur einmalige Verwendung)
```

---

## ✅ Validierungs-Checkliste

Nach Schema-Migration prüfen:

- [ ] Alle alten Users haben `super_admin` Spalte
- [ ] Alle Vehicles haben `tenant_id` (NOT NULL)
- [ ] Alle Users haben mindestens 1 Eintrag in `tenant_members`
- [ ] First Admin hat `super_admin = true`
- [ ] `vehicles.license_plate` unique per tenant_id
- [ ] Foreign Keys sind aktiv (`pragma foreign_keys = ON` für SQLite)
- [ ] Indizes erstellt und aktiv
- [ ] Migration Script testen im STAGING (vor Production!)

---

## 📝 Umgebungsvariablen

```bash
# Backend .env Update

# Standard JWT Secret (bleibt gleich)
JWT_SECRET=your_secret_here

# Multi-Tenant spezifisch:
ENABLE_MULTITENANT=true
DEFAULT_TENANT_NAME=Default Organization  # Name beim Erstsetup
INVITATION_CODE_LENGTH=8  # 6-12, empfohlen 8
INVITATION_EXPIRES_HOURS=24  # Gültigkeitsdauer
SUPER_ADMIN_SETUP_MODE=false  # true = Erster User wird auto super_admin
```

---

## 📊 Schema-Versioning

```javascript
// In backend/src/db/database.js oder separater Migration-Runner:

const SCHEMA_VERSION = 2;  // Version 1 = alte Single-Tenant, 2 = Multi-Tenant

async function initSchema() {
  const currentVersion = db.queryOne(
    "SELECT value FROM meta WHERE key = 'schema_version'"
  );
  
  if (!currentVersion) {
    // Erstes Setup
    applySchema_v2();
    db.execute("INSERT INTO meta (key, value) VALUES ('schema_version', '2')");
  } else if (currentVersion.value === '1') {
    // Migrate from v1 to v2
    applyMigration_v1_to_v2();
  }
  // Else: already v2, no action
}

async function applyMigration_v1_to_v2() {
  // Alle ALTER, CREATE TABLE Statements von oben
  // + Migrationsscript (populate tenants, tenant_members, etc.)
}
```

---

## 🚨 Häufige Fehler & wie man sie vermeidet

| Fehler | Auswirkung | Vermeidung |
|--------|------------|-----------|
| `WHERE user_id = ?` ohne Tenant-Check | **Datenleck** – User A sieht User B's Reservations | Code-Review ✓, API-Layer Validation |
| `INSERT vehicles(...) WITHOUT tenant_id` | **NULL-Constraint Violation** | Validierung im API-Layer vor INSERT |
| `UPDATE vehicles SET active = 0` (alle!) | User von anderen Tenants sieht keine Fahrzeuge | Immer `WHERE tenant_id = ?` |
| Invitation-Code nie validiert auf Expiry | User können abgelaufene Codes nutzen | Cron-Job oder Prüfung in Endpoint |
| `vehicles.license_plate` global unique | Zwei Tenants können nicht dasselbe Kennzeichen haben | Unique-Index nur per `(license_plate, tenant_id)` |

---

**Status:** READY FOR IMPLEMENTATION  
**Letztes Update:** März 2026
