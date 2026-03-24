import { Router } from 'express';
import { getDb } from '../db/database.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/', authenticate, requireAdmin, (req, res) => {
  const db = getDb();
  const users = db.prepare(
    'SELECT id, name, email, role, created_at FROM users ORDER BY name'
  ).all();
  res.json(users);
});

router.patch('/:id/role', authenticate, requireAdmin, (req, res) => {
  const { role } = req.body;
  if (!['admin', 'user'].includes(role)) {
    return res.status(400).json({ error: 'Ungültige Rolle' });
  }
  if (Number(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'Eigene Rolle kann nicht geändert werden' });
  }

  const db = getDb();
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  res.json({ success: true });
});

router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  if (Number(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'Eigener Account kann nicht gelöscht werden' });
  }
  const db = getDb();
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

router.get('/:id/km-summary', authenticate, requireAdmin, (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) {
    return res.status(400).json({ error: 'Zeitraum fehlt (from/to erforderlich)' });
  }
  if (String(from) > String(to)) {
    return res.status(400).json({ error: 'Ungültiger Zeitraum: from muss vor to liegen' });
  }

  const db = getDb();
  const userId = Number(req.params.id);
  const user = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(userId);
  if (!user) {
    return res.status(404).json({ error: 'Benutzer nicht gefunden' });
  }

  const byVehicle = db.prepare(`
    SELECT
      v.id as vehicle_id,
      v.name as vehicle_name,
      v.license_plate,
      COALESCE(v.price_per_km, 0) as price_per_km,
      v.flat_fee as flat_fee,
      COUNT(r.id) as trips,
      COALESCE(SUM(r.km_driven), 0) as total_km
    FROM reservations r
    JOIN vehicles v ON v.id = r.vehicle_id
    WHERE r.user_id = ?
      AND r.status = 'completed'
      AND r.km_driven IS NOT NULL
      AND r.date >= ?
      AND r.date <= ?
    GROUP BY v.id, v.name, v.license_plate, v.price_per_km, v.flat_fee
    ORDER BY total_km DESC, trips DESC, v.name ASC
  `).all(userId, from, to);

  const totals = db.prepare(`
    SELECT
      COUNT(r.id) as total_trips,
      COALESCE(SUM(r.km_driven), 0) as total_km
    FROM reservations r
    WHERE r.user_id = ?
      AND r.status = 'completed'
      AND r.km_driven IS NOT NULL
      AND r.date >= ?
      AND r.date <= ?
  `).get(userId, from, to);

  const withCosts = byVehicle.map((entry) => {
    const trips = Number(entry.trips) || 0;
    const totalKm = Number(entry.total_km) || 0;
    const pricePerKm = Number(entry.price_per_km) || 0;
    const flatFee = entry.flat_fee == null ? null : Number(entry.flat_fee);
    const kmCost = Number((totalKm * pricePerKm).toFixed(2));
    const flatCost = flatFee == null ? 0 : Number((trips * flatFee).toFixed(2));
    const totalCost = Number((kmCost + flatCost).toFixed(2));

    return {
      ...entry,
      trips,
      total_km: totalKm,
      price_per_km: Number(pricePerKm.toFixed(4)),
      flat_fee: flatFee,
      km_cost: kmCost,
      flat_cost: flatCost,
      total_cost: totalCost,
    };
  });

  const totalKmCost = Number(withCosts.reduce((sum, row) => sum + row.km_cost, 0).toFixed(2));
  const totalFlatCost = Number(withCosts.reduce((sum, row) => sum + row.flat_cost, 0).toFixed(2));
  const totalCost = Number((totalKmCost + totalFlatCost).toFixed(2));

  res.json({
    user,
    period: { from, to },
    totals: {
      total_trips: Number(totals.total_trips) || 0,
      total_km: Number(totals.total_km) || 0,
      total_km_cost: totalKmCost,
      total_flat_cost: totalFlatCost,
      total_cost: totalCost,
    },
    byVehicle: withCosts,
  });
});

export default router;
