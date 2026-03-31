import { Router } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, unlinkSync, existsSync } from 'fs';
import multer from 'multer';
import { db } from '../db/client.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '../../data/uploads/vehicles');
mkdirSync(uploadsDir, { recursive: true });

const maxImageSizeBytes = 5 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const vehicleId = Number(req.params.id);
    const extByMime = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
    };
    const ext = extByMime[file.mimetype] || path.extname(file.originalname || '').toLowerCase() || '.img';
    cb(null, `vehicle-${vehicleId}-${Date.now()}${ext}`);
  },
});

const uploadVehicleImage = multer({
  storage,
  limits: { fileSize: maxImageSizeBytes },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.mimetype)) {
      cb(new Error('Nur JPG, PNG oder WEBP sind erlaubt'));
      return;
    }
    cb(null, true);
  },
});

function isUniqueViolation(err) {
  return Boolean(
    err?.code === '23505' ||
    err?.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
    err?.code === 'SQLITE_CONSTRAINT' ||
    String(err?.message || '').includes('UNIQUE constraint failed')
  );
}

function isForeignKeyViolation(err) {
  return Boolean(
    err?.code === '23503' ||
    err?.code === 'SQLITE_CONSTRAINT_FOREIGNKEY' ||
    String(err?.message || '').toLowerCase().includes('foreign key')
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
  const { name, license_plate, type, description, price_per_km, flat_fee } = req.body;
  if (!name || !license_plate) {
    return res.status(400).json({ error: 'Name und Kennzeichen sind erforderlich' });
  }

  const normalizedPricePerKm = Number(price_per_km ?? 0);
  const normalizedFlatFee = flat_fee === '' || flat_fee == null ? null : Number(flat_fee);

  if (!Number.isFinite(normalizedPricePerKm) || normalizedPricePerKm < 0) {
    return res.status(400).json({ error: 'price_per_km muss eine Zahl >= 0 sein' });
  }

  if (normalizedFlatFee != null && (!Number.isFinite(normalizedFlatFee) || normalizedFlatFee < 0)) {
    return res.status(400).json({ error: 'flat_fee muss null oder eine Zahl >= 0 sein' });
  }

  try {
    const { lastInsertId, row } = await db.execute(
      'INSERT INTO vehicles (tenant_id, name, license_plate, type, description, price_per_km, flat_fee) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id',
      [
        req.tenantId,
        name.trim(),
        license_plate.trim().toUpperCase(),
        type || 'PKW',
        description || '',
        normalizedPricePerKm,
        normalizedFlatFee,
      ]
    );
    const id = row?.id ?? lastInsertId;
    const vehicle = await db.queryOne('SELECT * FROM vehicles WHERE id = ? AND tenant_id = ?', [id, req.tenantId]);
    res.status(201).json(vehicle);
  } catch {
    res.status(409).json({ error: 'Kennzeichen bereits vorhanden' });
  }
});

router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  const isSuperAdminGlobal = Boolean(req.user?.super_admin) && !req.tenantId;
  if (!isSuperAdminGlobal && requireTenantContext(req, res)) return;

  const { name, license_plate, type, description, price_per_km, flat_fee, active } = req.body;
  const vehicleId = Number(req.params.id);

  if (!Number.isInteger(vehicleId) || vehicleId <= 0) {
    return res.status(400).json({ error: 'Ungueltige Fahrzeug-ID' });
  }

  if (!name || !license_plate) {
    return res.status(400).json({ error: 'Name und Kennzeichen sind erforderlich' });
  }

  const normalizedPricePerKm = Number(price_per_km ?? 0);
  const normalizedFlatFee = flat_fee === '' || flat_fee == null ? null : Number(flat_fee);

  if (!Number.isFinite(normalizedPricePerKm) || normalizedPricePerKm < 0) {
    return res.status(400).json({ error: 'price_per_km muss eine Zahl >= 0 sein' });
  }

  if (normalizedFlatFee != null && (!Number.isFinite(normalizedFlatFee) || normalizedFlatFee < 0)) {
    return res.status(400).json({ error: 'flat_fee muss null oder eine Zahl >= 0 sein' });
  }

  try {
    const existingVehicle = isSuperAdminGlobal
      ? await db.queryOne('SELECT id, active, tenant_id FROM vehicles WHERE id = ?', [vehicleId])
      : await db.queryOne('SELECT id, active, tenant_id FROM vehicles WHERE id = ? AND tenant_id = ?', [vehicleId, req.tenantId]);

    if (!existingVehicle) {
      return res.status(404).json({ error: 'Fahrzeug nicht gefunden' });
    }

    const scopedTenantId = existingVehicle.tenant_id;

    const normalizedPlate = String(license_plate).trim().toUpperCase();
    const duplicate = await db.queryOne(
      'SELECT id FROM vehicles WHERE tenant_id = ? AND UPPER(license_plate) = ? AND id != ? LIMIT 1',
      [scopedTenantId, normalizedPlate, vehicleId]
    );

    if (duplicate) {
      return res.status(409).json({ error: 'Kennzeichen bereits vorhanden' });
    }

    const normalizedActive = active == null ? Boolean(existingVehicle.active) : Boolean(active);
    await db.execute(
      'UPDATE vehicles SET name=?, license_plate=?, type=?, description=?, price_per_km=?, flat_fee=?, active=? WHERE id=?',
      [
        name.trim(),
        normalizedPlate,
        type || 'PKW',
        description || '',
        normalizedPricePerKm,
        normalizedFlatFee,
        normalizedActive,
        vehicleId,
      ]
    );

    const effectiveTenantId = req.tenantId ?? scopedTenantId ?? null;
    const vehicle = effectiveTenantId
      ? await db.queryOne('SELECT * FROM vehicles WHERE id = ? AND tenant_id = ?', [vehicleId, effectiveTenantId])
      : await db.queryOne('SELECT * FROM vehicles WHERE id = ?', [vehicleId]);
    res.json(vehicle);
  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(409).json({ error: 'Kennzeichen bereits vorhanden' });
    }

    console.error(err);
    res.status(500).json({ error: 'Fehler beim Aktualisieren des Fahrzeugs' });
  }
});

router.post('/:id/image', authenticate, requireAdmin, (req, res) => {
  // SuperAdmin without an active tenant may upload to any vehicle.
  const isSuperAdminGlobal = Boolean(req.user?.super_admin) && !req.tenantId;
  if (!isSuperAdminGlobal && requireTenantContext(req, res)) return;

  uploadVehicleImage.single('image')(req, res, async (uploadErr) => {
    try {
      if (uploadErr) {
        const isSizeError = uploadErr instanceof multer.MulterError && uploadErr.code === 'LIMIT_FILE_SIZE';
        const errorMessage = isSizeError
          ? 'Bild ist zu gross (max. 5 MB)'
          : uploadErr.message || 'Bild konnte nicht hochgeladen werden';
        return res.status(400).json({ error: errorMessage });
      }

      const vehicleId = Number(req.params.id);
      if (!Number.isInteger(vehicleId) || vehicleId <= 0) {
        return res.status(400).json({ error: 'Ungueltige Fahrzeug-ID' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'Kein Bild uebermittelt' });
      }

      const existingVehicle = isSuperAdminGlobal
        ? await db.queryOne('SELECT id, image_path, tenant_id FROM vehicles WHERE id = ?', [vehicleId])
        : await db.queryOne('SELECT id, image_path, tenant_id FROM vehicles WHERE id = ? AND tenant_id = ?', [vehicleId, req.tenantId]);

      if (!existingVehicle) {
        return res.status(404).json({ error: 'Fahrzeug nicht gefunden' });
      }

      const imagePath = `/uploads/vehicles/${req.file.filename}`;

      await db.execute(
        'UPDATE vehicles SET image_path = ? WHERE id = ?',
        [imagePath, vehicleId]
      );

      if (existingVehicle.image_path) {
        const previousFile = path.join(__dirname, '../../data', existingVehicle.image_path.replace(/^\//, ''));
        if (existsSync(previousFile)) {
          try {
            unlinkSync(previousFile);
          } catch {
            // Keep response successful even if old file cleanup fails.
          }
        }
      }

      const effectiveTenantId = req.tenantId ?? existingVehicle.tenant_id ?? null;
      const vehicle = effectiveTenantId
        ? await db.queryOne('SELECT * FROM vehicles WHERE id = ? AND tenant_id = ?', [vehicleId, effectiveTenantId])
        : await db.queryOne('SELECT * FROM vehicles WHERE id = ?', [vehicleId]);
      return res.json(vehicle);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Fehler beim Speichern des Fahrzeugbilds' });
    }
  });
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

router.delete('/:id/permanent', authenticate, requireAdmin, async (req, res) => {
  const isSuperAdminGlobal = Boolean(req.user?.super_admin) && !req.tenantId;
  if (!isSuperAdminGlobal && requireTenantContext(req, res)) return;

  const vehicleId = Number(req.params.id);
  if (!Number.isInteger(vehicleId) || vehicleId <= 0) {
    return res.status(400).json({ error: 'Ungueltige Fahrzeug-ID' });
  }

  try {
    const vehicle = isSuperAdminGlobal
      ? await db.queryOne('SELECT id, active, image_path, tenant_id FROM vehicles WHERE id = ?', [vehicleId])
      : await db.queryOne('SELECT id, active, image_path, tenant_id FROM vehicles WHERE id = ? AND tenant_id = ?', [vehicleId, req.tenantId]);

    if (!vehicle) {
      return res.status(404).json({ error: 'Fahrzeug nicht gefunden' });
    }

    if (Boolean(vehicle.active)) {
      return res.status(400).json({ error: 'Fahrzeug erst deaktivieren, dann permanent loeschen' });
    }

    await db.execute('DELETE FROM vehicles WHERE id = ?', [vehicleId]);

    if (vehicle.image_path) {
      const filePath = path.join(__dirname, '../../data', vehicle.image_path.replace(/^\//, ''));
      if (existsSync(filePath)) {
        try {
          unlinkSync(filePath);
        } catch {
          // Keep delete successful even if file cleanup fails.
        }
      }
    }

    return res.json({ success: true });
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      return res.status(409).json({ error: 'Fahrzeug hat Reservierungen und kann nicht permanent geloescht werden' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Fehler beim permanenten Loeschen des Fahrzeugs' });
  }
});

export default router;
