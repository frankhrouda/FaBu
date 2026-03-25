import { Router } from 'express';
import { db } from '../db/client.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const vehicles = req.user.role === 'admin'
      ? await db.queryMany('SELECT * FROM vehicles ORDER BY active DESC, name', [])
      : await db.queryMany('SELECT * FROM vehicles WHERE active = 1 ORDER BY name', []);
    res.json(vehicles);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Laden der Fahrzeuge' });
  }
});

router.post('/', authenticate, requireAdmin, async (req, res) => {
  const { name, license_plate, type, description } = req.body;
  if (!name || !license_plate) {
    return res.status(400).json({ error: 'Name und Kennzeichen sind erforderlich' });
  }
  try {
    const { lastInsertId, row } = await db.execute(
      'INSERT INTO vehicles (name, license_plate, type, description) VALUES (?, ?, ?, ?) RETURNING id',
      [name.trim(), license_plate.trim().toUpperCase(), type || 'PKW', description || '']
    );
    const id = row?.id ?? lastInsertId;
    const vehicle = await db.queryOne('SELECT * FROM vehicles WHERE id = ?', [id]);
    res.status(201).json(vehicle);
  } catch {
    res.status(409).json({ error: 'Kennzeichen bereits vorhanden' });
  }
});

router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  const { name, license_plate, type, description, active } = req.body;
  if (!name || !license_plate) {
    return res.status(400).json({ error: 'Name und Kennzeichen sind erforderlich' });
  }
  try {
    await db.execute(
      'UPDATE vehicles SET name=?, license_plate=?, type=?, description=?, active=? WHERE id=?',
      [name.trim(), license_plate.trim().toUpperCase(), type || 'PKW', description || '', active ?? 1, req.params.id]
    );
    const vehicle = await db.queryOne('SELECT * FROM vehicles WHERE id = ?', [req.params.id]);
    res.json(vehicle);
  } catch {
    res.status(409).json({ error: 'Kennzeichen bereits vorhanden' });
  }
});

router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    await db.execute('UPDATE vehicles SET active = 0 WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Deaktivieren des Fahrzeugs' });
  }
});

export default router;
