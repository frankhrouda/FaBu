import { Router } from 'express';
import { db } from '../db/client.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();

const WITH_DETAILS = `
  SELECT r.*, u.name as user_name, u.email as user_email,
         v.name as vehicle_name, v.license_plate
  FROM reservations r
  JOIN users u ON r.user_id = u.id
  JOIN vehicles v ON r.vehicle_id = v.id
`;

router.get('/', authenticate, async (req, res) => {
  try {
    const reservations = req.user.role === 'admin'
      ? await db.queryMany(`${WITH_DETAILS} ORDER BY r.date DESC, r.time_from DESC`, [])
      : await db.queryMany(`${WITH_DETAILS} WHERE r.user_id = ? ORDER BY r.date DESC, r.time_from DESC`, [req.user.id]);
    res.json(reservations);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Laden der Reservierungen' });
  }
});

router.get('/availability', authenticate, async (req, res) => {
  const { vehicle_id, date, date_to, time_from, time_to, exclude_id } = req.query;
  if (!vehicle_id || !date || !time_from || !time_to) {
    return res.status(400).json({ error: 'Parameter fehlen' });
  }

  const endDate = date_to || date;
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

  try {
    const conflict = await db.queryOne(query, params);
    res.json({ available: !conflict });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler bei der Verfügbarkeitsprüfung' });
  }
});

router.post('/', authenticate, async (req, res) => {
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

  try {
    const vehicle = await db.queryOne('SELECT id FROM vehicles WHERE id = ? AND active = TRUE', [vehicle_id]);
    if (!vehicle) return res.status(404).json({ error: 'Fahrzeug nicht gefunden' });

    const conflict = await db.queryOne(`
      SELECT id FROM reservations
      WHERE vehicle_id = ? AND status != 'cancelled'
      AND (date || ' ' || time_from) < (? || ' ' || ?)
      AND (COALESCE(date_to, date) || ' ' || time_to) > (? || ' ' || ?)
    `, [vehicle_id, endDate, time_to, date, time_from]);

    if (conflict) {
      return res.status(409).json({ error: 'Fahrzeug ist in diesem Zeitraum bereits reserviert' });
    }

    const { lastInsertId, row } = await db.execute(
      'INSERT INTO reservations (user_id, vehicle_id, date, date_to, time_from, time_to, reason) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.user.id, vehicle_id, date, endDate, time_from, time_to, reason.trim()]
    );
    const id = row?.id ?? lastInsertId;

    const reservation = await db.queryOne(`${WITH_DETAILS} WHERE r.id = ?`, [id]);
    res.status(201).json(reservation);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Erstellen der Reservierung' });
  }
});

router.patch('/:id/complete', authenticate, async (req, res) => {
  const { km_driven, destination } = req.body;
  if (!km_driven || !destination) {
    return res.status(400).json({ error: 'Kilometer und Zielort sind erforderlich' });
  }
  if (km_driven < 1) {
    return res.status(400).json({ error: 'Kilometer muss größer als 0 sein' });
  }

  try {
    const reservation = await db.queryOne('SELECT * FROM reservations WHERE id = ?', [req.params.id]);
    if (!reservation) return res.status(404).json({ error: 'Reservierung nicht gefunden' });

    if (reservation.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Keine Berechtigung' });
    }
    if (reservation.status !== 'reserved') {
      return res.status(400).json({ error: 'Reservierung kann nicht abgeschlossen werden' });
    }

    await db.execute(
      "UPDATE reservations SET km_driven=?, destination=?, status='completed' WHERE id=?",
      [Number(km_driven), destination.trim(), req.params.id]
    );

    const updated = await db.queryOne(`${WITH_DETAILS} WHERE r.id = ?`, [req.params.id]);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Abschließen der Reservierung' });
  }
});

router.patch('/:id/cancel', authenticate, async (req, res) => {
  try {
    const reservation = await db.queryOne('SELECT * FROM reservations WHERE id = ?', [req.params.id]);
    if (!reservation) return res.status(404).json({ error: 'Reservierung nicht gefunden' });

    if (reservation.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Keine Berechtigung' });
    }
    if (reservation.status !== 'reserved') {
      return res.status(400).json({ error: 'Nur aktive Reservierungen können storniert werden' });
    }

    await db.execute("UPDATE reservations SET status = 'cancelled' WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Stornieren der Reservierung' });
  }
});

router.get('/vehicle/:vehicle_id', authenticate, async (req, res) => {
  try {
    const reservations = await db.queryMany(
      `${WITH_DETAILS} WHERE r.vehicle_id = ? AND r.status != 'cancelled' ORDER BY r.date ASC, r.time_from ASC`,
      [req.params.vehicle_id]
    );
    res.json(reservations);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Laden der Fahrzeug-Reservierungen' });
  }
});

export default router;
