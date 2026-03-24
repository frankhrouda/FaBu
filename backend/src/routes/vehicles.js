import { Router } from 'express';
import { getDb } from '../db/database.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();

function parsePricePerKm(value) {
  if (value == null || value === '') return 0;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return Number(num.toFixed(4));
}

function parseFlatFee(value) {
  if (value == null || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return Number(num.toFixed(2));
}

router.get('/', authenticate, (req, res) => {
  const db = getDb();
  const vehicles = req.user.role === 'admin'
    ? db.prepare('SELECT * FROM vehicles ORDER BY active DESC, name').all()
    : db.prepare('SELECT * FROM vehicles WHERE active = 1 ORDER BY name').all();
  res.json(vehicles);
});

router.post('/', authenticate, requireAdmin, (req, res) => {
  const { name, license_plate, type, description, price_per_km, flat_fee } = req.body;
  if (!name || !license_plate) {
    return res.status(400).json({ error: 'Name und Kennzeichen sind erforderlich' });
  }

  const parsedPricePerKm = parsePricePerKm(price_per_km);
  const parsedFlatFee = parseFlatFee(flat_fee);
  if (parsedPricePerKm == null) {
    return res.status(400).json({ error: 'Preis pro km ist ungültig' });
  }
  if (flat_fee != null && flat_fee !== '' && parsedFlatFee == null) {
    return res.status(400).json({ error: 'Pauschale ist ungültig' });
  }

  const db = getDb();
  try {
    const result = db.prepare(
      'INSERT INTO vehicles (name, license_plate, type, description, price_per_km, flat_fee) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      name.trim(),
      license_plate.trim().toUpperCase(),
      type || 'PKW',
      description || '',
      parsedPricePerKm,
      parsedFlatFee,
    );
    const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(vehicle);
  } catch {
    res.status(409).json({ error: 'Kennzeichen bereits vorhanden' });
  }
});

router.put('/:id', authenticate, requireAdmin, (req, res) => {
  const { name, license_plate, type, description, active, price_per_km, flat_fee } = req.body;
  if (!name || !license_plate) {
    return res.status(400).json({ error: 'Name und Kennzeichen sind erforderlich' });
  }

  const parsedPricePerKm = parsePricePerKm(price_per_km);
  const parsedFlatFee = parseFlatFee(flat_fee);
  if (parsedPricePerKm == null) {
    return res.status(400).json({ error: 'Preis pro km ist ungültig' });
  }
  if (flat_fee != null && flat_fee !== '' && parsedFlatFee == null) {
    return res.status(400).json({ error: 'Pauschale ist ungültig' });
  }

  const db = getDb();
  try {
    db.prepare(
      'UPDATE vehicles SET name=?, license_plate=?, type=?, description=?, price_per_km=?, flat_fee=?, active=? WHERE id=?'
    ).run(
      name.trim(),
      license_plate.trim().toUpperCase(),
      type || 'PKW',
      description || '',
      parsedPricePerKm,
      parsedFlatFee,
      active ?? 1,
      req.params.id,
    );
    const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);
    res.json(vehicle);
  } catch {
    res.status(409).json({ error: 'Kennzeichen bereits vorhanden' });
  }
});

router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  const db = getDb();
  db.prepare('UPDATE vehicles SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
