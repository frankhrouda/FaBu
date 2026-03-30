# Multi-Tenant Sicherheit & Testing Checklist

**Status:** Weiterhin relevant, aber nicht mehr nur vor Implementation  
**Version:** 1.0  
**Erstellt:** März 2026

## Hinweis zum aktuellen Stand

Die Multi-Tenant-Funktionalität ist bereits implementiert und produktiv im Einsatz.
Diese Datei ist daher heute vor allem als Review-, Regression- und Audit-Checkliste zu verstehen.

Besonders relevant nach der Umsetzung:
- Tenant-Isolation bei allen Reads/Writes weiter regressionssicher halten
- Superadmin-Only-Flows separat testen
- Produktionsnahe Tests für PostgreSQL statt nur SQLite berücksichtigen
- Admin-/Superadmin-Mutationen auf Nebeneffekte und Datenkonsistenz prüfen

---

## 🔐 Sicherheits-Kritikalität

Multi-Tenant-Isolation ist die wichtigste Sicherheitsanforderung. **Ein Fehler = Datenleck über Mandanten-Grenzen!**

---

## 🛡️ Code-Review Checklist

Diese Punkte **MÜSSEN** in jedem Pull Request überprüft werden:

### A. Tenant-Filter auf allen SELECT-Queries

```javascript
// ❌ FALSCH:
app.get('/vehicles/:id', authenticate, async (req, res) => {
  const vehicle = await db.queryOne('SELECT * FROM vehicles WHERE id = ?', [req.params.id]);
  res.json(vehicle);
});
// Problem: User A könnte Vehicle von User B in anderem Tenant sehen!

// ✅ RICHTIG:
app.get('/tenants/:tenantId/vehicles/:id', authenticate, ensureTenantAccess, async (req, res) => {
  const vehicle = await db.queryOne(
    'SELECT * FROM vehicles WHERE id = ? AND tenant_id = ?',
    [req.params.id, req.params.tenantId]
  );
  
  if (!vehicle) return res.status(404).json({ error: 'Not found' });
  res.json(vehicle);
});
```

**Checkpunkte:**
- [ ] Alle SELECT haben WHERE tenant_id = ?
- [ ] Tenant-ID kommt aus JWT (req.tenantId), nicht aus Body
- [ ] Doppel-Validierung: Middleware + DB-Layer
- [ ] Foreign Keys sind aktiv (SQLite: `PRAGMA foreign_keys = ON`)

### B. Write-Operationen (INSERT, UPDATE, DELETE)

```javascript
// ❌ FALSCH:
app.post('/vehicles', authenticate, requireAdmin, async (req, res) => {
  const { name, license_plate } = req.body;
  await db.execute(
    'INSERT INTO vehicles (name, license_plate) VALUES (?, ?)',
    [name, license_plate]
  );
  // Problem: Welcher Mandant? Falls keine FK, könnte NULL sein!
});

// ✅ RICHTIG:
app.post('/tenants/:tenantId/vehicles', 
  authenticate, 
  ensureTenantAccess, 
  ensureTenantAdmin, 
  async (req, res) => {
    const { name, license_plate } = req.body;
    
    // Validiere dass Tenant existiert (doppel-check)
    const tenant = await db.queryOne('SELECT id FROM tenants WHERE id = ?', [req.params.tenantId]);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    
    try {
      await db.execute(
        'INSERT INTO vehicles (tenant_id, name, license_plate) VALUES (?, ?, ?)',
        [req.params.tenantId, name, license_plate]
      );
      res.status(201).json({ success: true });
    } catch (err) {
      if (err.message.includes('UNIQUE')) {
        return res.status(409).json({ error: 'License plate already exists in this tenant' });
      }
      throw err;
    }
  }
);
```

**Checkpunkte:**
- [ ] tenant_id wird EXPLIZIT eingefügt, nicht aus Body
- [ ] UNIQUE constraints bedenken (pro Tenant oder global?)
- [ ] Foreign Key Constraints sind definiert
- [ ] Error-Handling für Constraint-Verletzungen

### C. Implizite Tenant-Filterung über Foreign Keys

```javascript
// ✅ Funktioniert wenn richtig designt:
// Reservationen müssen User UND Vehicle vom gleichen Tenant haben

app.get('/reservations', authenticate, async (req, res) => {
  const reservations = await db.queryMany(`
    SELECT r.* FROM reservations r
    JOIN vehicles v ON r.vehicle_id = v.id
    WHERE v.tenant_id = ?  -- Implizite Filter!
  `, [req.tenantId]);
  
  res.json(reservations);
});
```

**Checkpunkte:**
- [ ] JOIN-Bedingungen prüfen, nicht nur FK-Definition
- [ ] Keine Lücke zwischen Vehicle und Reservation
- [ ] Test: Kann User A Reservationen von Vehicle B (anderer Tenant) sehen?

### D. Rollen-basierte Zugriffskontrolle (RBAC)

```javascript
// ✅ KORREKT:
// SuperAdmin > alle Mandanten
// TenantAdmin > sein Mandant
// User > nur lesender Zugriff auf seinen Mandant

app.get('/users', authenticate, async (req, res) => {
  let users;
  
  if (req.user.super_admin) {
    // SuperAdmin sieht alle User aller Mandanten
    users = await db.queryMany('SELECT * FROM users', []);
  } else if (req.tenantRole === 'admin') {
    // TenantAdmin sieht nur seine Mandanten-User
    users = await db.queryMany(`
      SELECT u.* FROM users u
      JOIN tenant_members tm ON u.id = tm.user_id
      WHERE tm.tenant_id = ? AND tm.role = 'admin'
    `, [req.tenantId]);
  } else {
    // Regular User sieht fast nichts (oder nur sein Profil)
    return res.status(403).json({ error: 'Permission denied' });
  }
  
  res.json(users);
});
```

---

## 🧪 Security Testing Checkliste

### Test 1: Cross-Tenant Data Access

```javascript
// Test: User A (Tenant 1) kann Vehicle B (Tenant 2) nicht sehen

test('User A cannot see vehicles from Tenant 2', async () => {
  // Setup: 2 Tenants, 2 Users, 2 Vehicles
  const tenant1 = await createTenant('Tenant 1');
  const tenant2 = await createTenant('Tenant 2');
  
  const userA = await registerWithInvite('user.a@test.com', tenant1);
  const vehicleB = await createVehicle(tenant2, 'Vehicle B');
  
  // Act: Login as User A, try to get Vehicle B
  const token = userA.token;
  const response = await fetch(`/api/vehicles/${vehicleB.id}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  // Assert: Should be 404 or 403, not 200
  expect(response.status).toBe(404 || 403);
  expect(response.body.error).toContain('Not found');
});
```

### Test 2: Reservation Cross-Tenant

```javascript
test('User cannot reserve vehicle from different tenant', async () => {
  const userA = await createUser('Tenant 1');
  const vehicleB = await createVehicle('Tenant 2', 'Car B');
  
  const response = await fetch('/api/reservations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${userA.token}` },
    body: {
      vehicle_id: vehicleB.id,
      date: '2026-04-01'
    }
  });
  
  // Should fail because vehicle.tenant_id !== userA.tenant_id
  expect(response.status).toBe(403 || 400);
});
```

### Test 3: Admin Privilege Escalation

```javascript
test('User cannot change own role to admin', async () => {
  const user = await createUser('Tenant 1', 'user');
  
  const response = await fetch(`/api/tenants/1/members/${user.id}/role`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${user.token}` },
    body: { role: 'admin' }
  });
  
  // Only TenantAdmin can change roles, not the user itself
  expect(response.status).toBe(403);
});

test('TenantAdmin cannot promote self to SuperAdmin', async () => {
  const admin = await createUser('Tenant 1', 'admin');
  
  const response = await fetch('/api/admin/tenants', {
    method: 'POST',
    headers: { Authorization: `Bearer ${admin.token}` },
    body: { name: 'New Tenant' }
  });
  
  // Only SuperAdmin can create tenants
  expect(response.status).toBe(403);
});
```

### Test 4: Invitation Code Validation

```javascript
test('Expired invitation code cannot be used', async () => {
  const expiredCode = await createInvitationCode('tenant@test.com', -1); // expired
  
  const response = await fetch('/api/auth/register-with-invite', {
    method: 'POST',
    body: {
      code: expiredCode.code,
      name: 'New User',
      email: 'newuser@test.com',
      password: 'password123'
    }
  });
  
  expect(response.status).toBe(400);
  expect(response.body.error).toContain('expired');
});

test('Invitation code can only be used once', async () => {
  const code = await createInvitationCode('tenant@test.com');
  
  // First use: should succeed
  const response1 = await fetch('/api/auth/register-with-invite', {
    method: 'POST',
    body: { code, name: 'User 1', email: 'user1@test.com', password: 'pwd' }
  });
  expect(response1.status).toBe(201);
  
  // Second use: should fail
  const response2 = await fetch('/api/auth/register-with-invite', {
    method: 'POST',
    body: { code, name: 'User 2', email: 'user2@test.com', password: 'pwd' }
  });
  expect(response2.status).toBe(400);
  expect(response2.body.error).toContain('already used');
});
```

### Test 5: License Plate Uniqueness

```javascript
test('License plate must be unique per tenant, not globally', async () => {
  const tenant1 = await createTenant('Tenant 1');
  const tenant2 = await createTenant('Tenant 2');
  
  const admin1 = await createUser(tenant1, 'admin');
  const admin2 = await createUser(tenant2, 'admin');
  
  // Create vehicle in Tenant 1 with license plate "AC-123"
  const v1 = await createVehicle(tenant1, admin1.token, {
    license_plate: 'AC-123-XY'
  });
  expect(v1.status).toBe(201);
  
  // Create same license plate in Tenant 2: SHOULD SUCCEED
  const v2 = await createVehicle(tenant2, admin2.token, {
    license_plate: 'AC-123-XY'
  });
  expect(v2.status).toBe(201); // ✓ Different tenants, same plate OK
  
  // Create same license plate again in Tenant 1: SHOULD FAIL
  const v3 = await createVehicle(tenant1, admin1.token, {
    license_plate: 'AC-123-XY'
  });
  expect(v3.status).toBe(409); // Conflict
});
```

### Test 6: JWT Token Validation

```javascript
test('Invalid JWT is rejected', async () => {
  const response = await fetch('/api/vehicles', {
    headers: { Authorization: 'Bearer invalid.token.here' }
  });
  
  expect(response.status).toBe(401);
});

test('Expired JWT is rejected', async () => {
  const oldToken = await createExpiredToken();
  
  const response = await fetch('/api/vehicles', {
    headers: { Authorization: `Bearer ${oldToken}` }
  });
  
  expect(response.status).toBe(401);
  expect(response.body.error).toContain('expired');
});

test('User deleted from tenant cannot access with old token', async () => {
  const user = await createUser('Tenant 1');
  
  // Delete user from tenant_members
  await deleteUserFromTenant(user.id, 'Tenant 1');
  
  // Try to access with old token
  const response = await fetch('/api/vehicles', {
    headers: { Authorization: `Bearer ${user.token}` }
  });
  
  // Should fail because middleware re-checks tenant_members
  expect(response.status).toBe(403);
});
```

### Test 7: SQL Injection Prevention

```javascript
test('SQL injection in tenant_id is prevented', async () => {
  const user = await createUser('Tenant 1');
  
  // Try SQL injection in URL
  const response = await fetch(`/api/tenants/1 OR 1=1/vehicles`, {
    headers: { Authorization: `Bearer ${user.token}` }
  });
  
  // Should 404 or treat literal string as integer
  expect(response.status).toBe(404 || 400);
});

test('SQL injection in parameters is prevented (prepared statements)', async () => {
  const user = await createUser('Tenant 1');
  
  // Try injection in query parameter
  const response = await fetch(`/api/vehicles?search="'; DROP TABLE vehicles; --"`, {
    headers: { Authorization: `Bearer ${user.token}` }
  });
  
  // Should be safe because we use prepared statements
  expect(db.tables).toContain('vehicles'); // Table still exists!
});
```

---

## 📊 Performance & Load Testing

### Query Performance

```sql
-- Diese Queries sollten indexed sein (siehe SCHEMA):
EXPLAIN QUERY PLAN
SELECT v.* FROM vehicles v
WHERE v.tenant_id = ? AND v.active = 1;
-- Index: idx_vehicles_active_tenant

EXPLAIN QUERY PLAN
SELECT u.* FROM users u
JOIN tenant_members tm ON u.id = tm.user_id
WHERE tm.tenant_id = ?;
-- Indexes: idx_tenant_members_tenant_id, idx_tenant_members_user_id
```

### Load Test Szenarien

```javascript
// Szenario 1: 1000 Users, 100 Vehicles, 10k Reservationen
// Test: GET /tenants/:tenantId/vehicles sollte < 100ms sein

// Szenario 2: 1M Rows in DB
// Test: Tenant-Filter funktioniert noch?
// Prüfe: Query-Plans sind nicht ändern (index scans, keine full scans)
```

---

## 🔍 Audit Logging

### Was muss geloggt werden?

```javascript
// CRITICAL - immer loggen:
- User Registration (mit Code)
- User Login
- Tenant Creation
- User Role Changes
- Invitation Code Usage
- Vehicle Creation/Deletion
- Admin Actions

// Struktur:
{
  action: 'USER_ROLE_CHANGED',
  admin_id: 1,
  target_user_id: 15,
  tenant_id: 5,
  changes: {
    before: { role: 'user' },
    after: { role: 'admin' }
  },
  timestamp: '2026-03-27T10:00:00Z',
  ip_address: '192.168.1.1'  // Optional
}
```

### Audit Log Query

```sql
-- Zeige alle Admin-Aktionen in Tenant 5 von User 1
SELECT * FROM audit_logs
WHERE tenant_id = 5 AND admin_id = 1
ORDER BY created_at DESC;
```

---

## 🚨 Error Handling & Information Disclosure

### Sichere Fehlermeldungen

```javascript
// ❌ FALSCH – Information Disclosure:
{
  "error": "Vehicle with ID 42 not found in database"
  // Verrät: Vehicle existiert in DB, User hat nur keinen Zugriff
}

// ✅ RICHTIG:
{
  "error": "Not found"
  // Verrät nicht, ob Resource existiert
}
```

### Logging ohne Datenlecks

```javascript
// ❌ FALSCH:
console.log('Trying to access vehicle', vehicleData);  // vehicleData enthält sensitive info

// ✅ RICHTIG:
console.log('Trying to access vehicle', vehicleId, 'in tenant', tenantId);
```

---

## 📋 Deployment Checklist

Vor dem Production-Rollout:

- [ ] Alle Sicherheits-Tests grün
- [ ] Code-Review von 2+ Devs auf Tenant-Isolation
- [ ] Datenbank-Indizes erstellt
- [ ] Staging-Migration getestet
- [ ] Rollback-Strategie dokumentiert
- [ ] Monitoring aktiviert:
  - Alert auf 403 Forbidden spike (könnte Angriff sein)
  - Alert auf 401/Token-Fehler spike
  - Alert auf DB-Constraint-Violations
- [ ] Audit-Logging aktiviert
- [ ] Super-Admin Account erstellt & verified
- [ ] First Tenant + Admins eingerichtet
- [ ] Alte "root" Admin Accounts deaktiviert (wenn Single-Tenant migriert)

---

## 🔧 Debugging & Troubleshooting

### User sieht falschen Mandanten-Daten

```javascript
// 1. Prüfe JWT Token
const decoded = jwt_decode(token);
console.log('Active Tenant:', decoded.active_tenant_id);

// 2. Prüfe DB:
SELECT * FROM tenant_members WHERE user_id = ? AND tenant_id = ?;

// 3. Prüfe Query Logs
EXPLAIN QUERY PLAN SELECT ... WHERE tenant_id = ?;
```

### Invitation Code funktioniert nicht

```javascript
// 1. Prüfe Code-Existenz & Expiry:
SELECT * FROM invitation_codes WHERE code = ?;

// 2. Prüfe Tenant-Existenz:
SELECT * FROM tenants WHERE id = (SELECT tenant_id FROM invitation_codes WHERE code = ?);

// 3. Prüfe Token-Generierung:
jwt_decode(newToken)  // Sollte active_tenant_id haben
```

---

**Version:** 1.0

**WARNUNG:** Diese Checkliste ist nicht vollständig. Update sie basierend auf neuen Funden!
