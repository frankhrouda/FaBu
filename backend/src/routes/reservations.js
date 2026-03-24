import { Router } from 'express';
import { getDb } from '../db/database.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();

const WITH_DETAILS = `
  SELECT r.*, u.name as user_name, u.email as user_email,
         v.name as vehicle_name, v.license_plate
  FROM reservations r
  JOIN users u ON r.user_id = u.id
  JOIN vehicles v ON r.vehicle_id = v.id
`;

router.get('/', authenticate, (req, res) => {
  const db = getDb();
  const reservations = req.user.role === 'admin'
    ? db.prepare(`${WITH_DETAILS} ORDER BY r.date DESC, r.time_from DESC`).all()
    : db.prepare(`${WITH_DETAILS} WHERE r.user_id = ? ORDER BY r.date DESC, r.time_from DESC`).all(req.user.id);
  res.json(reservations);
});

router.get('/availability', authenticate, (req, res) => {
  const { vehicle_id, date, date_to, time_from, time_to, exclude_id } = req.query;
  if (!vehicle_id || !date || !time_from || !time_to) {
    return res.status(400).json({ error: 'Parameter fehlen' });
  }

  const endDate = date_to || date;
  const db = getDb();
  // Conflict: existing.start < new.end AND existing.end > new.start (datetime string comparison)
  let query = `
    SELECT id FROM reservations
    WHERE vehicle_id = ? AND status != 'cancelled'
    AND (date || ' ' || time_from) < (? || ' ' || ?)
    AND (COALESCE(date_to, date) || ' ' || time_to) > (? || ' ' || ?)
  `;
  const params = [vehicle_id, endDate, time_to, date, time_from];

  if (exclude_id) {
    query += ' AND id != ?';
    params.push(exclude_id);
  }

  const conflict = db.prepare(query).get(...params);
  res.json({ available: !conflict });
});

router.post('/', authenticate, (req, res) => {
  const { vehicle_id, date, date_to, time_from, time_to, reason } = req.body;
  if (!vehicle_id || !date || !time_from || !time_to || !reason) {
    return res.status(400).json({ error: 'Alle Felder sind erforderlich' });
  }

  const endDate = date_to || date;
  if (endDate < date) {
    return res.status(400).json({ error: 'Enddatum muss am oder nach dem Startdatum liegen' });
  }
  if (endDate === date && time_from >= time_to) {
    return res.status(400).json({ error: 'Endzeit muss nach Startzeit liegen' });
  }

  const db = getDb();

  const vehicle = db.prepare('SELECT id FROM vehicles WHERE id = ? AND active = 1').get(vehicle_id);
  if (!vehicle) return res.status(404).json({ error: 'Fahrzeug nicht gefunden' });

  const conflict = db.prepare(`
    SELECT id FROM reservations
    WHERE vehicle_id = ? AND status != 'cancelled'
    AND (date || ' ' || time_from) < (? || ' ' || ?)
    AND (COALESCE(date_to, date) || ' ' || time_to) > (? || ' ' || ?)
  `).get(vehicle_id, endDate, time_to, date, time_from);

  if (conflict) {
    return res.status(409).json({ error: 'Fahrzeug ist in diesem Zeitraum bereits reserviert' });
  }

  const result = db.prepare(
    'INSERT INTO reservations (user_id, vehicle_id, date, date_to, time_from, time_to, reason) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(req.user.id, vehicle_id, date, endDate, time_from, time_to, reason.trim());

  const reservation = db.prepare(`${WITH_DETAILS} WHERE r.id = ?`).get(result.lastInsertRowid);
  res.status(201).json(reservation);
});

router.patch('/:id/complete', authenticate, (req, res) => {
  const { km_driven, destination } = req.body;
  if (!km_driven || !destination) {
    return res.status(400).json({ error: 'Kilometer und Zielort sind erforderlich' });
  }
  if (km_driven < 1) {
    return res.status(400).json({ error: 'Kilometer muss größer als 0 sein' });
  }

  const db = getDb();
  const reservation = db.prepare('SELECT * FROM reservations WHERE id = ?').get(req.params.id);
  if (!reservation) return res.status(404).json({ error: 'Reservierung nicht gefunden' });

  if (reservation.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Keine Berechtigung' });
  }
  if (reservation.status !== 'reserved') {
    return res.status(400).json({ error: 'Reservierung kann nicht abgeschlossen werden' });
  }

  db.prepare(
    "UPDATE reservations SET km_driven=?, destination=?, status='completed' WHERE id=?"
  ).run(Number(km_driven), destination.trim(), req.params.id);

  const updated = db.prepare(`${WITH_DETAILS} WHERE r.id = ?`).get(req.params.id);
  res.json(updated);
});

router.patch('/:id/cancel', authenticate, (req, res) => {
  const db = getDb();
  const reservation = db.prepare('SELECT * FROM reservations WHERE id = ?').get(req.params.id);
  if (!reservation) return res.status(404).json({ error: 'Reservierung nicht gefunden' });

  if (reservation.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Keine Berechtigung' });
  }
  if (reservation.status !== 'reserved') {
    return res.status(400).json({ error: 'Nur aktive Reservierungen können storniert werden' });
  }

  db.prepare("UPDATE reservations SET status = 'cancelled' WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

router.get('/vehicle/:vehicle_id', authenticate, (req, res) => {
  const db = getDb();
  const reservations = db.prepare(`${WITH_DETAILS} WHERE r.vehicle_id = ? AND r.status != 'cancelled' ORDER BY r.date ASC, r.time_from ASC`).all(req.params.vehicle_id);
  res.json(reservations);
});

export default router;
