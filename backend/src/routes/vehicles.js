import { Router } from 'express';
import { db } from '../db/client.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();

function isUniqueViolation(err) {
  return Boolean(
    err?.code === '23505' ||
    err?.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
    err?.code === 'SQLITE_CONSTRAINT' ||
    String(err?.message || '').includes('UNIQUE constraint failed')
  );
}

function requireTenantContext(req, res, { allowSuperAdminWithoutTenant = false } = {}) {
  if (allowSuperAdminWithoutTenant && req.user?.super_admin) {
    return false;
  }
  if (!req.tenantId) {
    res.status(400).json({ error: 'Aktiver Mandant erforderlich' });
    return true;
  }
  return false;
}

router.get('/', authenticate, async (req, res) => {
  if (requireTenantContext(req, res, { allowSuperAdminWithoutTenant: true })) return;
  try {
    const isAdmin = req.user.super_admin || req.tenantRole === 'admin';
    const vehicles = req.user.super_admin && !req.tenantId
      ? await db.queryMany('SELECT * FROM vehicles ORDER BY active DESC, name', [])
      : isAdmin
        ? await db.queryMany('SELECT * FROM vehicles WHERE tenant_id = ? ORDER BY active DESC, name', [req.tenantId])
        : await db.queryMany('SELECT * FROM vehicles WHERE active = TRUE AND tenant_id = ? ORDER BY name', [req.tenantId]);
    res.json(vehicles);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Laden der Fahrzeuge' });
  }
});

router.post('/', authenticate, requireAdmin, async (req, res) => {
  if (requireTenantContext(req, res)) return;
  const { name, license_plate, type, description } = req.body;
  if (!name || !license_plate) {
    return res.status(400).json({ error: 'Name und Kennzeichen sind erforderlich' });
  }
  try {
    const { lastInsertId, row } = await db.execute(
      'INSERT INTO vehicles (tenant_id, name, license_plate, type, description) VALUES (?, ?, ?, ?, ?) RETURNING id',
      [req.tenantId, name.trim(), license_plate.trim().toUpperCase(), type || 'PKW', description || '']
    );
    const id = row?.id ?? lastInsertId;
    const vehicle = await db.queryOne('SELECT * FROM vehicles WHERE id = ? AND tenant_id = ?', [id, req.tenantId]);
    res.status(201).json(vehicle);
  } catch {
    res.status(409).json({ error: 'Kennzeichen bereits vorhanden' });
  }
});

router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  if (requireTenantContext(req, res)) return;
  const { name, license_plate, type, description, active } = req.body;
  const vehicleId = Number(req.params.id);

  if (!Number.isInteger(vehicleId) || vehicleId <= 0) {
    return res.status(400).json({ error: 'Ungueltige Fahrzeug-ID' });
  }

  if (!name || !license_plate) {
    return res.status(400).json({ error: 'Name und Kennzeichen sind erforderlich' });
  }

  try {
    const existingVehicle = await db.queryOne(
      'SELECT id, active FROM vehicles WHERE id = ? AND tenant_id = ?',
      [vehicleId, req.tenantId]
    );

    if (!existingVehicle) {
      return res.status(404).json({ error: 'Fahrzeug nicht gefunden' });
    }

    const normalizedPlate = String(license_plate).trim().toUpperCase();
    const duplicate = await db.queryOne(
      'SELECT id FROM vehicles WHERE tenant_id = ? AND UPPER(license_plate) = ? AND id != ? LIMIT 1',
      [req.tenantId, normalizedPlate, vehicleId]
    );

    if (duplicate) {
      return res.status(409).json({ error: 'Kennzeichen bereits vorhanden' });
    }

    const normalizedActive = active == null ? Boolean(existingVehicle.active) : Boolean(active);
    await db.execute(
      'UPDATE vehicles SET name=?, license_plate=?, type=?, description=?, active=? WHERE id=? AND tenant_id=?',
      [name.trim(), normalizedPlate, type || 'PKW', description || '', normalizedActive, vehicleId, req.tenantId]
    );

    const vehicle = await db.queryOne('SELECT * FROM vehicles WHERE id = ? AND tenant_id = ?', [vehicleId, req.tenantId]);
    res.json(vehicle);
  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(409).json({ error: 'Kennzeichen bereits vorhanden' });
    }

    console.error(err);
    res.status(500).json({ error: 'Fehler beim Aktualisieren des Fahrzeugs' });
  }
});

router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  if (requireTenantContext(req, res)) return;
  try {
    await db.execute('UPDATE vehicles SET active = FALSE WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenantId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Deaktivieren des Fahrzeugs' });
  }
});

export default router;
