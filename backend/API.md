# FaBu API Vertrag (Ist-Stand)

Diese Datei beschreibt den tatsaechlich implementierten API-Vertrag fuer Web- und Mobile-Clients.

## Basis

- Base URL (Prod): `https://app.fabu-online.de/api`
- Base URL (Lokal): `http://localhost:3001/api`
- Format: `application/json` (ausser Upload-Endpunkte mit `multipart/form-data`)
- Authentifizierung: `Authorization: Bearer <token>`

## Rollen und Tenant-Kontext

- `super_admin`: darf global arbeiten und kann optional einen aktiven Mandanten waehlen.
- Tenant-Admin: `tenant_role = admin` im aktiven Mandanten.
- Tenant-User: `tenant_role = user` im aktiven Mandanten.

Wichtig:
- Viele Endpunkte erwarten einen aktiven Mandanten im Token (`active_tenant_id`).
- Superadmin darf bei einigen Endpunkten ohne aktiven Mandanten global arbeiten (z. B. `GET /users`, `GET /vehicles`, `GET /reservations`).

## Fehlerformat

```json
{ "error": "Fehlermeldung" }
```

## Standard-Statuscodes

- `200` OK
- `201` Created
- `400` Bad Request
- `401` Unauthorized
- `403` Forbidden
- `404` Not Found
- `409` Conflict
- `429` Too Many Requests
- `500` Internal Server Error

## Auth

### POST `/auth/register`

Registriert einen Benutzer. Wenn es der erste Benutzer ist:
- `super_admin = true`
- es wird automatisch ein Default-Mandant angelegt
- Benutzer wird dort als Tenant-Admin eingetragen

Request:

```json
{
  "name": "Max Mustermann",
  "email": "max@example.com",
  "password": "secret123"
}
```

Antwort `201`:

```json
{
  "token": "<jwt>",
  "user": {
    "id": 1,
    "name": "Max Mustermann",
    "email": "max@example.com",
    "role": "admin",
    "super_admin": true,
    "active_tenant_id": 1
  },
  "available_tenants": [
    {
      "id": 1,
      "name": "Default Tenant",
      "role": "admin"
    }
  ]
}
```

Moegliche Fehler: `400`, `403`, `409`, `429`, `500`

### POST `/auth/register-with-invite`

Registrierung ueber Einladungscode.

Request:

```json
{
  "code": "ABC123XYZ",
  "name": "John Doe",
  "email": "john@example.com",
  "password": "secret123"
}
```

Antwort `201`: `token`, `user`, `available_tenants`, `tenant_name`

Moegliche Fehler: `400`, `409`, `429`, `500`

### POST `/auth/tenant-admin-requests`

Oeffentliche Anfrage fuer neue Tenant-Admin-Freischaltung.

Request:

```json
{
  "name": "Admin Kandidat",
  "email": "admin@example.com",
  "tenant_name": "Neue Firma GmbH",
  "password": "optionalmindestens6",
  "message": "Optionaler Hinweis"
}
```

Antwort `201`:

```json
{
  "request": {
    "id": 42,
    "name": "Admin Kandidat",
    "email": "admin@example.com",
    "tenant_name": "Neue Firma GmbH",
    "status": "pending"
  }
}
```

Moegliche Fehler: `400`, `409`, `429`, `500`

### POST `/auth/login`

Antwort `200`: `token`, `user`, `available_tenants`

Moegliche Fehler: `400`, `401`, `403`, `409`, `429`, `500`

### POST `/auth/switch-tenant/:tenantId` (auth, nur superadmin)

Wechselt den aktiven Mandanten fuer Superadmins.

- `tenantId` kann auch `all` sein (globaler Modus, `active_tenant_id = null`).

Antwort `200`: neues `token`, `user`, optional `tenant`

Moegliche Fehler: `400`, `401`, `403`, `404`, `429`, `500`

### POST `/auth/invitations` (auth + admin)

Erstellt einen Einladungscode.

Request (optional):

```json
{
  "tenant_id": 5,
  "email": "new.user@example.com",
  "expires_in_hours": 24
}
```

Antwort `201`:

```json
{
  "invitation": {
    "id": 10,
    "tenant_id": 5,
    "tenant_name": "ACME GmbH",
    "code": "ABCDEFG123",
    "email": "new.user@example.com",
    "expires_at": "2026-04-03T12:00:00.000Z"
  }
}
```

Moegliche Fehler: `400`, `401`, `403`, `404`, `429`, `500`

## Superadmin-Endpunkte (`/admin`)

Alle Endpunkte in diesem Abschnitt verlangen: `auth + super_admin`.

### GET `/admin/tenants`

Antwort `200`:

```json
{
  "tenants": [
    {
      "id": 1,
      "name": "ACME GmbH",
      "created_by": 1,
      "created_at": "2026-03-01T10:00:00.000Z",
      "user_count": 10,
      "admin_count": 2,
      "vehicle_count": 6,
      "reservation_count": 123
    }
  ],
  "total": 1
}
```

### POST `/admin/tenants`

Request:

```json
{
  "name": "Neue Firma GmbH",
  "first_admin_email": "admin@example.com",
  "description": "Optional"
}
```

Antwort `201`: `tenant`

### PATCH `/admin/tenants/:tenantId`

Request:

```json
{
  "name": "Umbenannter Mandant"
}
```

Antwort `200`:

```json
{
  "success": true,
  "tenant": {
    "id": 5,
    "name": "Umbenannter Mandant",
    "created_by": 1,
    "created_at": "2026-03-01T10:00:00.000Z"
  }
}
```

### DELETE `/admin/tenants/:tenantId`

Loescht Mandant nur wenn keine Fahrzeuge mehr zugeordnet sind.

Antwort `200`:

```json
{ "success": true, "tenant_id": 5 }
```

### GET `/admin/tenant-admin-requests?status=pending|approved|rejected|all`

Antwort `200`: `{ "requests": [...] }`

### POST `/admin/tenant-admin-requests/:requestId/approve`

Request (optional):

```json
{
  "tenant_name": "Optionaler Override-Name"
}
```

Antwort `200`:

```json
{
  "success": true,
  "tenant": { "id": 5, "name": "ACME GmbH" },
  "user": { "id": 12, "email": "admin@example.com" }
}
```

### POST `/admin/tenant-admin-requests/:requestId/reject`

Request (optional):

```json
{ "reason": "Optionaler Ablehnungsgrund" }
```

Antwort `200`:

```json
{ "success": true }
```

### GET `/admin/tenants/:tenantId/members`

Antwort `200`:

```json
{
  "tenant": { "id": 5, "name": "ACME GmbH" },
  "members": [
    {
      "id": 12,
      "name": "Max",
      "email": "max@example.com",
      "role": "user",
      "super_admin": false,
      "tenant_role": "admin",
      "joined_at": "2026-03-01T10:00:00.000Z"
    }
  ]
}
```

### POST `/admin/tenants/:tenantId/members`

Legt direkt einen Benutzer im Mandanten an.

Request:

```json
{
  "name": "Neuer User",
  "email": "user@example.com",
  "password": "secret123",
  "role": "user"
}
```

Antwort `201`: `{ "success": true, "user": {...}, "tenant": {...} }`

### PATCH `/admin/tenants/:tenantId/members/:userId/role`

Request:

```json
{ "role": "admin" }
```

Antwort `200`: `{ "success": true, "user": {...} }`

## Tenant-Endpunkte (`/tenants`)

### GET `/tenants/:tenantId` (auth + tenant access)

Antwort `200`:

```json
{
  "tenant": {
    "id": 5,
    "name": "ACME GmbH",
    "created_by": 1,
    "created_at": "2026-03-01T10:00:00.000Z",
    "stats": {
      "user_count": 10,
      "admin_count": 2,
      "vehicle_count": 6,
      "reservation_count": 123
    }
  }
}
```

### GET `/tenants/:tenantId/members` (auth + tenant access)

Antwort `200`: `{ "members": [...] }`

### GET `/tenants/:tenantId/invitations` (auth + tenant admin)

Antwort `200`: `{ "invitations": [...] }`

### POST `/tenants/:tenantId/invitations` (auth + tenant admin)

Request (optional):

```json
{
  "email": "new.user@example.com",
  "expires_in_hours": 24
}
```

Antwort `201`: `{ "invitation": {...} }`

### PATCH `/tenants/:tenantId/members/:userId/role` (auth + tenant admin)

Request:

```json
{ "role": "admin" }
```

Antwort `200`: `{ "success": true, "user": {...} }`

### DELETE `/tenants/:tenantId/members/:userId` (auth + tenant admin)

Antwort `200`:

```json
{ "success": true }
```

## Vehicles

### GET `/vehicles` (auth)

- Superadmin ohne aktiven Mandanten: alle Fahrzeuge tenant-uebergreifend.
- Tenant-Admin: alle Fahrzeuge des aktiven Mandanten (auch inaktive).
- Tenant-User: nur aktive Fahrzeuge des aktiven Mandanten.

Antwort `200`: Liste von Fahrzeugobjekten.

### POST `/vehicles` (auth + admin)

Request:

```json
{
  "name": "VW Golf",
  "license_plate": "B-AB-123",
  "type": "PKW",
  "description": "Poolfahrzeug",
  "price_per_km": 0.35,
  "flat_fee": 2.5
}
```

Antwort `201`: Fahrzeugobjekt.

### PUT `/vehicles/:id` (auth + admin)

Aktualisiert Fahrzeug inkl. optional `active`.

Antwort `200`: aktualisiertes Fahrzeugobjekt.

### POST `/vehicles/:id/image` (auth + admin)

`multipart/form-data` mit Feld `image`.

- erlaubt: `image/jpeg`, `image/png`, `image/webp`
- max. `5 MB`

Antwort `200`: aktualisiertes Fahrzeugobjekt.

### DELETE `/vehicles/:id` (auth + admin)

Soft-Delete (`active = false`).

Antwort `200`: `{ "success": true }`

### DELETE `/vehicles/:id/permanent` (auth + admin)

Hard-Delete. Fahrzeug muss vorher deaktiviert sein.

Antwort `200`: `{ "success": true }`

Moeglicher Konflikt: `409` wenn noch Reservierungen existieren.

## Reservations

### GET `/reservations` (auth)

- Superadmin ohne aktiven Mandanten: alle Reservierungen.
- Tenant-Admin: alle Reservierungen im aktiven Mandanten.
- Tenant-User: nur eigene Reservierungen im aktiven Mandanten.

### GET `/reservations/availability` (auth)

Query:
- `vehicle_id` (required)
- `date` (required)
- `date_to` (optional)
- `time_from` (required)
- `time_to` (required)
- `exclude_id` (optional)

Antwort `200`:

```json
{ "available": true }
```

### POST `/reservations` (auth)

Request:

```json
{
  "vehicle_id": 1,
  "date": "2026-04-02",
  "date_to": "2026-04-02",
  "time_from": "09:00",
  "time_to": "11:00",
  "reason": "Kundentermin"
}
```

Antwort `201`: angelegte Reservierung mit User- und Fahrzeugdetails.

### PATCH `/reservations/:id/complete` (auth)

Request:

```json
{
  "km_driven": 36,
  "destination": "Muenchen"
}
```

Antwort `200`: aktualisierte Reservierung.

### PATCH `/reservations/:id/cancel` (auth)

Antwort `200`:

```json
{ "success": true }
```

### GET `/reservations/vehicle/:vehicle_id` (auth)

Antwort `200`: nicht stornierte Reservierungen dieses Fahrzeugs.

## Users (admin)

### GET `/users` (auth + admin)

- Superadmin ohne aktiven Mandanten: globale Benutzerliste.
- Sonst: Benutzer des aktiven Mandanten.

### PATCH `/users/:id/role` (auth + admin)

Request:

```json
{ "role": "user" }
```

Antwort `200`:

```json
{ "success": true }
```

### DELETE `/users/:id` (auth + admin)

Antwort `200`:

```json
{ "success": true }
```

### GET `/users/:id/km-summary?from=YYYY-MM-DD&to=YYYY-MM-DD` (auth + admin)

Antwort `200`:

```json
{
  "user": {
    "id": 3,
    "name": "Max Mustermann",
    "email": "max@example.com"
  },
  "period": {
    "from": "2026-03-01",
    "to": "2026-03-31"
  },
  "totals": {
    "total_trips": 12,
    "total_km": 345,
    "total_km_cost": 120.75,
    "total_flat_cost": 18,
    "total_cost": 138.75
  },
  "byVehicle": [
    {
      "vehicle_id": 1,
      "vehicle_name": "VW Golf",
      "license_plate": "B-AB-123",
      "price_per_km": 0.35,
      "flat_fee": 2.5,
      "trips": 6,
      "total_km": 210,
      "km_cost": 73.5,
      "flat_cost": 15,
      "total_cost": 88.5
    }
  ]
}
```

## Rate Limits

- `POST /api/auth/login`: max. 10 Requests pro 15 Minuten pro IP
- `POST /api/auth/register`: max. 10 Requests pro 15 Minuten pro IP
- `POST /api/auth/register-with-invite`: max. 10 Requests pro 15 Minuten pro IP
- `POST /api/auth/tenant-admin-requests`: max. 10 Requests pro 15 Minuten pro IP
- `GET/POST/... /api/*` allgemein: max. 300 Requests pro 15 Minuten pro IP

Antwort bei Ueberschreitung:

```json
{ "error": "Zu viele Anfragen. Bitte spaeter erneut versuchen." }
```
