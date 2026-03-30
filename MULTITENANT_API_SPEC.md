# Multi-Tenant API-Spezifikation

**Version:** 1.0 (historischer Draft, teilweise veraltet)  
**Basis URL:** `/api`  
**Auth:** Bearer Token in `Authorization` Header

## Wichtiger Hinweis

Diese Datei war die Planungsgrundlage fuer die Multi-Tenant-API.
Der produktive Ist-Stand ist inzwischen weiterentwickelt.

Bekannte Abweichungen zum Code:
- Nicht alle hier beschriebenen Endpunkte existieren exakt so.
- Zusaetzliche produktive Endpunkte wurden implementiert, z. B. fuer Superadmin-Mandantenverwaltung und Benutzeranlage im Mandanten.
- Fuer den tatsaechlichen Stand gilt der Code in `backend/src/routes/*.js`.

Vor Nutzung dieser Datei fuer Implementierung oder Fremdclients bitte immer gegen den aktuellen Code abgleichen.

---

## 🔑 JWT-Token Struktur (neu)

```javascript
// Token-Payload:
{
  id: 123,                    // User ID (global unique)
  super_admin: false,         // Ist dieser User Super-Admin?
  active_tenant_id: 5,        // Aktuell selektierter Mandant
  iat: 1234567890,            // Token-Ausgabezeit
  exp: 1234567890 + 7d        // Ablauf (7 Tage)
}

// Decoding im Frontend/Mobile:
const decoded = jwt_decode(token);
const isSuperAdmin = decoded.super_admin;
const currentTenantId = decoded.active_tenant_id;
```

---

## 📝 Auth Endpoints

### POST `/auth/register`

**Änderung:** Der erste User ist weiterhin Admin, aber jetzt super_admin statt nur tenant_admin.

Request:
```json
{
  "name": "Max Mustermann",
  "email": "max@example.com",
  "password": "secret123"
}
```

Response `201`:
```json
{
  "token": "<jwt>",
  "user": {
    "id": 1,
    "name": "Max Mustermann",
    "email": "max@example.com",
    "super_admin": true,
    "active_tenant_id": null  // Super-Admin hat keinen "aktiven" Mandant
  },
  "available_tenants": [],  // Leer bei super_admin
  "message": "Please create your first tenant or contact support"
}
```

---

### POST `/auth/register-with-invite`

**NEU** – Registrierung mit Einladungs-Code

Request:
```json
{
  "code": "ABC123XYZ",      // Aus Einladungs-Link
  "name": "John Smith",
  "email": "john@example.com",
  "password": "securepass123"
}
```

Response `201`:
```json
{
  "token": "<jwt>",
  "user": {
    "id": 456,
    "name": "John Smith",
    "email": "john@example.com",
    "super_admin": false,
    "active_tenant_id": 5
  },
  "available_tenants": [
    {
      "id": 5,
      "name": "ACME Corp",
      "role": "user",
      "created_at": "2026-03-01T10:00:00Z"
    }
  ]
}
```

**Fehler:**
- `400` – Code invalid, abgelaufen oder bereits verwendet
- `409` – Email bereits registriert
- `429` – Too many requests

---

### POST `/auth/login`

**Änderung:** Response erweitert mit `available_tenants`

Request:
```json
{
  "email": "max@example.com",
  "password": "secret123"
}
```

Response `200`:
```json
{
  "token": "<jwt>",
  "user": {
    "id": 1,
    "name": "Max Mustermann",
    "email": "max@example.com",
    "super_admin": true,
    "active_tenant_id": null
  },
  "available_tenants": [
    {
      "id": 1,
      "name": "ACME Corp",
      "role": "admin",
      "created_at": "2026-01-15T08:30:00Z"
    },
    {
      "id": 2,
      "name": "Tech StartUp GmbH",
      "role": "user",
      "created_at": "2026-02-20T14:00:00Z"
    }
  ]
}
```

---

### POST `/auth/switch-tenant/:tenantId`

**NEU** – Wechsel des aktiven Mandanten

Request:
```json
{
  "tenantId": 5
}
```

Response `200`:
```json
{
  "token": "<new_jwt_with_active_tenant_id_5>",
  "user": {
    "id": 123,
    "name": "John Smith",
    "super_admin": false,
    "active_tenant_id": 5
  },
  "tenant": {
    "id": 5,
    "name": "ACME Corp"
  }
}
```

**Fehler:**
- `403` – User hat keinen Zugriff auf Tenant 5
- `404` – Tenant nicht gefunden

---

### POST `/auth/invited-tenants/:invitationCode`

**NEU** – Validiere Einladungs-Code ohne Login

Request: (keine Body)

Response `200`:
```json
{
  "valid": true,
  "tenant": {
    "id": 5,
    "name": "ACME Corp"
  },
  "expires_in_hours": 12,
  "email_hint": "john@example.com"  // Optional, falls Email spezifisch
}
```

Response `400`:
```json
{
  "valid": false,
  "error": "Code expired or invalid"
}
```

---

## 🏢 Tenant Management APIs

### ⭐ SUPER-ADMIN ENDPOINTS

#### POST `/admin/tenants`

**Änderung:** SuperAdmin erstellt neue Mandanten

Request:
```json
{
  "name": "New Company GmbH",
  "description": "Ein neues Unternehmen"
}
```

Response `201`:
```json
{
  "tenant": {
    "id": 10,
    "name": "New Company GmbH",
    "description": "Ein neues Unternehmen",
    "created_by": 1,
    "created_at": "2026-03-27T10:00:00Z"
  },
  "admin_invitation": {
    "code": "ADMIN_ABC123XYZ",
    "expires_at": "2026-03-28T10:00:00Z",
    "message": "Share this code with the first tenant admin"
  }
}
```

**Authentifizierung:**
- Requires `super_admin: true`

**Fehler:**
- `403` – Nicht Super-Admin
- `400` – Name bereits existiert

---

#### GET `/admin/tenants`

Listet alle Mandanten (mit Statistik)

Response `200`:
```json
{
  "tenants": [
    {
      "id": 1,
      "name": "ACME Corp",
      "created_by": 1,
      "created_at": "2026-01-15T08:30:00Z",
      "stats": {
        "user_count": 42,
        "vehicle_count": 8,
        "reservation_count": 156,
        "admin_count": 2
      }
    },
    {
      "id": 2,
      "name": "Tech StartUp",
      "created_by": 5,
      "created_at": "2026-02-20T14:00:00Z",
      "stats": {
        "user_count": 8,
        "vehicle_count": 2,
        "reservation_count": 23,
        "admin_count": 1
      }
    }
  ],
  "total": 2,
  "pagination": {
    "page": 1,
    "per_page": 20,
    "has_more": false
  }
}
```

---

#### GET `/admin/tenants/:tenantId`

Details eines spezifischen Mandanten

Response `200`:
```json
{
  "tenant": {
    "id": 1,
    "name": "ACME Corp",
    "description": "Beförderungsunternehmen",
    "created_by": 1,
    "created_at": "2026-01-15T08:30:00Z",
    "stats": {
      "user_count": 42,
      "vehicle_count": 8,
      "reservation_count": 156
    }
  },
  "admins": [
    {
      "id": 1,
      "name": "Alice Admin",
      "email": "alice@acme.com",
      "role": "admin",
      "joined_at": "2026-01-15T08:30:00Z"
    },
    {
      "id": 3,
      "name": "Bob Admin",
      "email": "bob@acme.com",
      "role": "admin",
      "joined_at": "2026-01-20T14:00:00Z"
    }
  ]
}
```

---

#### GET `/admin/tenants/:tenantId/members`

Alle User eines Mandanten (SuperAdmin-Sicht)

Response `200`:
```json
{
  "members": [
    {
      "id": 2,
      "name": "John User",
      "email": "john@acme.com",
      "role": "user",
      "joined_at": "2026-01-16T10:00:00Z"
    },
    {
      "id": 3,
      "name": "Jane Admin",
      "email": "jane@acme.com",
      "role": "admin",
      "joined_at": "2026-01-15T08:30:00Z"
    }
  ],
  "pagination": {
    "total": 2,
    "page": 1
  }
}
```

---

#### PATCH `/admin/tenants/:tenantId/members/:userId/role`

SuperAdmin ändert Rollen von Usern

Request:
```json
{
  "role": "admin"  // 'admin' oder 'user'
}
```

Response `200`:
```json
{
  "success": true,
  "user": {
    "id": 2,
    "name": "John User",
    "role": "admin",
    "tenant_id": 1
  }
}
```

---

#### DELETE `/admin/tenants/:tenantId`

⚠️ **Vorsicht:** Löscht Mandant + alle verknüpften Daten (kaskadierend)

Request: (optional)
```json
{
  "confirm": "DELETE_MY_DATA"
}
```

Response `200`:
```json
{
  "success": true,
  "message": "Tenant and all associated data deleted permanently",
  "tenant_id": 5
}
```

**Fehler:**
- `403` – Nicht Super-Admin
- `409` – Bestätigung fehlerhaft
- `400` – Tenant hat aktive Reservationen (optional: Prüfung ein-/ausschaltbar)

---

### 👤 TENANT-ADMIN ENDPOINTS

#### GET `/tenants/:tenantId`

Informationen des eigenen (oder Super-Admin kann andere sehen)

Response `200`:
```json
{
  "tenant": {
    "id": 5,
    "name": "ACME Corp",
    "description": "Fleet management",
    "created_at": "2026-01-15T08:30:00Z",
    "stats": {
      "user_count": 42,
      "vehicle_count": 8,
      "reservation_count": 156
    }
  }
}
```

---

#### GET `/tenants/:tenantId/members`

Alle User meines Mandanten

Response `200`: (gleich wie `/admin/tenants/:tenantId/members`)

**Auth-Requirement:**
- User muss `role: admin` in diesem Tenant ODER `super_admin: true` sein

---

#### POST `/tenants/:tenantId/invitations`

TenantAdmin erstellt Einladungs-Code

Request:
```json
{
  "email": "new_user@example.com",  // Optional, für Email-spezifische Codes
  "expires_in_hours": 24
}
```

Response `201`:
```json
{
  "invitation": {
    "id": 42,
    "code": "ABC123XYZ",
    "email": "new_user@example.com",
    "created_at": "2026-03-27T10:00:00Z",
    "expires_at": "2026-03-28T10:00:00Z",
    "share_link": "https://fabu-online.de/register?code=ABC123XYZ",
    "used": false
  }
}
```

**Fehler:**
- `403` – Nicht TenantAdmin
- `400` – Invalid input

---

#### GET `/tenants/:tenantId/invitations`

Liste aller erstellten Einladungs-Codes

Response `200`:
```json
{
  "invitations": [
    {
      "id": 42,
      "email": "john@example.com",
      "created_by": "alice@acme.com",
      "created_at": "2026-03-27T10:00:00Z",
      "expires_at": "2026-03-28T10:00:00Z",
      "used": false
    },
    {
      "id": 41,
      "email": "jane@example.com",
      "created_by": "alice@acme.com", 
      "created_at": "2026-03-26T09:00:00Z",
      "expires_at": "2026-03-27T09:00:00Z",
      "used": true,
      "used_by": "jane@example.com",
      "used_at": "2026-03-26T15:30:00Z"
    }
  ],
  "pagination": {
    "total": 2,
    "page": 1
  }
}
```

---

#### PATCH `/tenants/:tenantId/members/:userId/role`

TenantAdmin ändert User-Rolle in eigenem Mandant

Request:
```json
{
  "role": "admin"  // 'admin' oder 'user' (gleicher Tenant)
}
```

Response `200`:
```json
{
  "success": true,
  "user": {
    "id": 10,
    "name": "John",
    "email": "john@acme.com",
    "role": "admin"
  }
}
```

**Einschränkungen:**
- TenantAdmin kann nur User **seines Mandanten** verwalten
- Kann andere TenantAdmins nicht zu SuperAdmin machen
- Kann nicht die eigene Rolle ändern

---

#### DELETE `/tenants/:tenantId/members/:userId`

Entfernt User aus Mandant (nicht global löschen!)

Response `200`:
```json
{
  "success": true,
  "message": "User removed from tenant"
}
```

---

## 🚗 Vehicles API (Angepasst)

### GET `/tenants/:tenantId/vehicles`

Alle Fahrzeuge des aktuellen Mandanten

**Änderung:** Pfad-Struktur mit tenant_id

Response `200`:
```json
{
  "vehicles": [
    {
      "id": 1,
      "tenant_id": 5,
      "name": "Mercedes Sprinter",
      "license_plate": "AC-123-XY",
      "type": "PKW",
      "description": "Klein-Lieferwagen",
      "price_per_km": 0.45,
      "flat_fee": 25.00,
      "active": true,
      "created_at": "2026-01-15T08:30:00Z"
    }
  ]
}
```

**Autorisierung:**
- User des Mandanten sieht nur `active: true`
- Admin des Mandanten sieht alle
- SuperAdmin sieht alle

---

### POST `/tenants/:tenantId/vehicles`

Erstelle Fahrzeug (TenantAdmin nur)

Request:
```json
{
  "name": "VW Transporter",
  "license_plate": "AC-456-AB",
  "type": "Transporter",
  "description": "Großraum-Lieferwagen",
  "price_per_km": 0.50,
  "flat_fee": 30.00
}
```

Response `201`:
```json
{
  "vehicle": {
    "id": 2,
    "tenant_id": 5,
    "name": "VW Transporter",
    "license_plate": "AC-456-AB",
    "price_per_km": 0.50,
    "flat_fee": 30.00,
    "active": true,
    "created_at": "2026-03-27T10:00:00Z"
  }
}
```

**Validierung:**
- `license_plate` muss unique sein **pro Tenant** (nicht global!)
- `tenant_id` wird vom Auth-Context impliziert

---

### PATCH `/tenants/:tenantId/vehicles/:vehicleId`

Update Fahrzeug-Details

Request:
```json
{
  "name": "Updated Name",
  "price_per_km": 0.55,
  "active": false
}
```

Response `200`: (Updated vehicle object)

---

### DELETE `/tenants/:tenantId/vehicles/:vehicleId`

Löscht Fahrzeug (Soft-Delete via `active: false` empfohlen)

---

## 📅 Reservations API (Unverändert in Struktur, implizite Tenant-Filterung)

### GET `/reservations`

Filter nur nach Fahrzeugen des aktuellen Mandanten (implizit über Vehicle-FK)

```sql
SELECT r.* FROM reservations r
JOIN vehicles v ON r.vehicle_id = v.id
WHERE v.tenant_id = $1  -- Aktueller Tenant des Users
```

---

### POST `/reservations`

Erstelle Reservierung (nur für Fahrzeuge des eigenen Mandanten möglich)

**Validierung:**
```javascript
const vehicle = await getVehicle(vehicleId);
if (vehicle.tenant_id !== req.tenant_id) {
  return res.status(403).json({ error: 'Forbidden' });
}
```

---

## 👥 Users API (Angepasst für Mandanten)

### GET `/tenants/:tenantId/users`

Alle User des Mandanten (früher: global)

**Authentifizierung:**
- TenantAdmin kann nur sein eigenes Tenant sehen
- SuperAdmin kann alle sehen

---

### PATCH `/users/:userId/role`

⚠️ **DEPRECATED** – Nutze stattdessen: `PATCH /tenants/:tenantId/members/:userId/role`

---

## 🔐 Authentifizierungs-Middleware

### Neue Middleware-Funktionen

```javascript
// 1. authenticate() – wie zuvor, aber extended JWT
export async function authenticate(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Not authorized' });
  
  const payload = jwt.verify(token, JWT_SECRET);
  const user = await db.queryOne(
    'SELECT id, name, email, super_admin FROM users WHERE id = ?',
    [payload.id]
  );
  
  req.user = user;
  req.tenantId = payload.active_tenant_id;
  next();
}

// 2. ensureTenantAccess() – Prüfe Tenant-Zugehörigkeit
export async function ensureTenantAccess(req, res, next) {
  const { tenantId } = req.params;
  
  if (req.user.super_admin) {
    // SuperAdmin hat Zugriff auf alles
    next();
    return;
  }
  
  // Prüfe ob User im Tenant ist
  const membership = await db.queryOne(
    'SELECT role FROM tenant_members WHERE tenant_id = ? AND user_id = ?',
    [tenantId, req.user.id]
  );
  
  if (!membership) {
    return res.status(403).json({ error: 'Not a member of this tenant' });
  }
  
  req.tenantRole = membership.role;
  next();
}

// 3. ensureTenantAdmin() – Prüfe Admin-Rolle im Tenant
export async function ensureTenantAdmin(req, res, next) {
  const { tenantId } = req.params;
  
  if (req.user.super_admin) {
    next();
    return;
  }
  
  const membership = await db.queryOne(
    'SELECT role FROM tenant_members WHERE tenant_id = ? AND user_id = ?',
    [tenantId, req.user.id]
  );
  
  if (membership?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin permissions required' });
  }
  
  next();
}

// 4. ensureSuperAdmin() – Nur SuperAdmins
export async function ensureSuperAdmin(req, res, next) {
  if (req.user.super_admin !== true) {
    return res.status(403).json({ error: 'Super-Admin permissions required' });
  }
  next();
}
```

---

## 📊 Error Responses (erweitert)

```javascript
// Neue Fehler für Multi-Tenant:

403 Forbidden – Not a member of this tenant
403 Forbidden – Admin permissions required
403 Forbidden – Super-Admin permissions required
409 Conflict – Tenant name already exists
409 Conflict – License plate already exists in this tenant
404 Not Found – Tenant not found
404 Not Found – Invitation code not found or expired
```

---

## 📝 Implementierungs-Notizen

### Route-Struktur Migration

**ALT (Single-Tenant):**
```
GET /vehicles
GET /users
PATCH /users/:id/role
POST /reservations
```

**NEU (Multi-Tenant):**
```
GET /tenants/:tenantId/vehicles
GET /tenants/:tenantId/users
GET /tenants/:tenantId/members
PATCH /tenants/:tenantId/members/:userId/role
POST /reservations  (implizit gefiltert nach vehicles.tenant_id)

# SuperAdmin:
GET /admin/tenants
POST /admin/tenants
PATCH /admin/tenants/:tenantId/members/:userId/role
```

### Tenant-ID Quelle

```javascript
// IMMER aus JWT extrahieren, NICHT aus Request-Body:

// ✅ RICHTIG:
const tenantId = req.tenantId;  // Aus JWT-Payload

// ❌ FALSCH:
const tenantId = req.body.tenant_id;  // User könnte manipulieren!
```

---

**Version:** 1.0 (Draft)  
**Status:** Ready for Backend Implementation  
**Letzte Änderung:** März 2026
