# FaBu API Vertrag

Diese Datei beschreibt den stabilen API-Vertrag fuer Clients (Web und Android).

## Basis

- Base URL (Prod): `https://fabu-online.de/api`
- Base URL (Lokal): `http://localhost:3001/api`
- Format: `application/json`
- Authentifizierung: `Authorization: Bearer <token>`

## Fehlerformat

Fehler werden als JSON geliefert:

```json
{ "error": "Fehlermeldung" }
```

## Standard-Statuscodes

- `200` OK
- `201` Created
- `400` Bad Request (Validierung/ungueltige Eingaben)
- `401` Unauthorized (kein/ungueltiger Token oder Login fehlgeschlagen)
- `403` Forbidden (keine Berechtigung)
- `404` Not Found
- `409` Conflict (z. B. bereits vorhandene E-Mail, Kennzeichen, Zeitkonflikt)
- `429` Too Many Requests (Rate-Limit)
- `500` Internal Server Error

## Auth

### POST `/auth/register`

Registriert einen neuen Benutzer. Der erste Benutzer wird `admin`.

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
    "role": "admin"
  }
}
```

Moegliche Fehler: `400`, `409`, `429`, `500`

### POST `/auth/login`

Request:

```json
{
  "email": "max@example.com",
  "password": "secret123"
}
```

Antwort `200`:

```json
{
  "token": "<jwt>",
  "user": {
    "id": 1,
    "name": "Max Mustermann",
    "email": "max@example.com",
    "role": "admin"
  }
}
```

Moegliche Fehler: `400`, `401`, `429`, `500`

## Vehicles

### GET `/vehicles` (auth)

- Admin: sieht auch inaktive Fahrzeuge.
- User: sieht nur aktive Fahrzeuge.

Antwort `200`:

```json
[
  {
    "id": 1,
    "name": "VW Golf",
    "license_plate": "B-AB-123",
    "type": "PKW",
    "description": "",
    "price_per_km": 0.35,
    "flat_fee": 2.5,
    "active": 1,
    "created_at": "2026-03-22 10:00:00"
  }
]
```

Moegliche Fehler: `401`, `429`, `500`

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

- `price_per_km`: individueller Kilometerpreis des Fahrzeugs (optional, Default `0`)
- `flat_fee`: optionale Pauschale pro Fahrt (`null` oder Zahl >= 0)

Antwort `201`: Fahrzeugobjekt.

Moegliche Fehler: `400`, `401`, `403`, `409`, `429`, `500`

### PUT `/vehicles/:id` (auth + admin)

Request:

```json
{
  "name": "VW Golf",
  "license_plate": "B-AB-123",
  "type": "PKW",
  "description": "Updated",
  "price_per_km": 0.35,
  "flat_fee": 2.5,
  "active": 1
}
```

Antwort `200`: aktualisiertes Fahrzeugobjekt.

Moegliche Fehler: `400`, `401`, `403`, `409`, `429`, `500`

### DELETE `/vehicles/:id` (auth + admin)

Setzt `active = 0` (Soft Delete).

Antwort `200`:

```json
{ "success": true }
```

Moegliche Fehler: `401`, `403`, `429`, `500`

## Reservations

### GET `/reservations` (auth)

- Admin: alle Reservierungen
- User: eigene Reservierungen

Antwort `200`: Liste von Reservierungen mit User- und Fahrzeugdetails.

Moegliche Fehler: `401`, `429`, `500`

### GET `/reservations/availability` (auth)

Query-Parameter:
- `vehicle_id` (required)
- `date` (required, `YYYY-MM-DD`)
- `time_from` (required, `HH:mm`)
- `time_to` (required, `HH:mm`)
- `exclude_id` (optional, fuer Update-Faelle)

Antwort `200`:

```json
{ "available": true }
```

Moegliche Fehler: `400`, `401`, `429`, `500`

### POST `/reservations` (auth)

Request:

```json
{
  "vehicle_id": 1,
  "date": "2026-03-23",
  "time_from": "09:00",
  "time_to": "11:00",
  "reason": "Kundentermin"
}
```

Antwort `201`: angelegte Reservierung mit Details.

Moegliche Fehler: `400`, `401`, `404`, `409`, `429`, `500`

### PATCH `/reservations/:id/complete` (auth)

Request:

```json
{
  "km_driven": 36,
  "destination": "Muenchen"
}
```

Antwort `200`: aktualisierte Reservierung.

Moegliche Fehler: `400`, `401`, `403`, `404`, `429`, `500`

### PATCH `/reservations/:id/cancel` (auth)

Antwort `200`:

```json
{ "success": true }
```

Moegliche Fehler: `400`, `401`, `403`, `404`, `429`, `500`

### GET `/reservations/vehicle/:vehicle_id` (auth)

Liefert nicht stornierte Reservierungen eines Fahrzeugs.

Antwort `200`: Liste von Reservierungen.

Moegliche Fehler: `401`, `429`, `500`

## Users (admin only)

### GET `/users` (auth + admin)

Antwort `200`:

```json
[
  {
    "id": 1,
    "name": "Max Mustermann",
    "email": "max@example.com",
    "role": "admin",
    "created_at": "2026-03-22 10:00:00"
  }
]
```

Moegliche Fehler: `401`, `403`, `429`, `500`

### PATCH `/users/:id/role` (auth + admin)

Request:

```json
{ "role": "user" }
```

Antwort `200`:

```json
{ "success": true }
```

Moegliche Fehler: `400`, `401`, `403`, `429`, `500`

### DELETE `/users/:id` (auth + admin)

Antwort `200`:

```json
{ "success": true }
```

Moegliche Fehler: `400`, `401`, `403`, `429`, `500`

### GET `/users/:id/km-summary?from=YYYY-MM-DD&to=YYYY-MM-DD` (auth + admin)

Liefert Kilometer- und Kosten-Auswertung eines Benutzers im Zeitraum.

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

Moegliche Fehler: `400`, `401`, `403`, `404`, `429`, `500`

## Rate Limits

- `POST /auth/login`: max. 10 Requests pro 15 Minuten pro IP
- `POST /auth/register`: max. 10 Requests pro 15 Minuten pro IP
- `/api` allgemein: max. 300 Requests pro 15 Minuten pro IP

Antwort bei Ueberschreitung:

```json
{ "error": "Zu viele Anfragen. Bitte spaeter erneut versuchen." }
```

## Versionierung

Aktuell laeuft die API unter `/api`.
Empfehlung fuer spaetere Breaking Changes: Einfuehrung von `/api/v1`.
