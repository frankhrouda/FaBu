import { Router } from 'express';
import { db } from '../db/client.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();

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

router.get('/', authenticate, requireAdmin, async (req, res) => {
  if (requireTenantContext(req, res, { allowSuperAdminWithoutTenant: true })) return;
  try {
    const users = req.user.super_admin && !req.tenantId
      ? await db.queryMany('SELECT id, name, email, role, super_admin, created_at FROM users ORDER BY name', [])
      : await db.queryMany(
        `SELECT u.id, u.name, u.email, u.role, u.super_admin, u.created_at, tm.role as tenant_role
         FROM users u
         JOIN tenant_members tm ON tm.user_id = u.id
         WHERE tm.tenant_id = ?
         ORDER BY u.name`,
        [req.tenantId]
      );
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Laden der Benutzer' });
  }
});

router.patch('/:id/role', authenticate, requireAdmin, async (req, res) => {
  if (requireTenantContext(req, res)) return;
  const { role } = req.body;
  if (!['admin', 'user'].includes(role)) {
    return res.status(400).json({ error: 'Ungültige Rolle' });
  }
  if (Number(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'Eigene Rolle kann nicht geändert werden' });
  }
  try {
    if (req.user.super_admin && !req.tenantId) {
      await db.execute('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id]);
    } else {
      await db.execute(
        'UPDATE tenant_members SET role = ? WHERE tenant_id = ? AND user_id = ?',
        [role, req.tenantId, req.params.id]
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Ändern der Rolle' });
  }
});

router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  if (requireTenantContext(req, res)) return;
  if (Number(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'Eigener Account kann nicht gelöscht werden' });
  }
  try {
    if (req.user.super_admin && !req.tenantId) {
      await db.execute('DELETE FROM users WHERE id = ?', [req.params.id]);
    } else {
      await db.execute('DELETE FROM tenant_members WHERE tenant_id = ? AND user_id = ?', [req.tenantId, req.params.id]);
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Löschen des Benutzers' });
  }
});

router.get('/:id/km-summary', authenticate, requireAdmin, async (req, res) => {
  if (requireTenantContext(req, res)) return;
  const { from, to } = req.query;
  if (!from || !to) {
    return res.status(400).json({ error: 'Zeitraum fehlt (from/to erforderlich)' });
  }
  if (String(from) > String(to)) {
    return res.status(400).json({ error: 'Ungültiger Zeitraum: from muss vor to liegen' });
  }

  const userId = Number(req.params.id);
  try {
    const user = req.user.super_admin && !req.tenantId
      ? await db.queryOne('SELECT id, name, email FROM users WHERE id = ?', [userId])
      : await db.queryOne(
        `SELECT u.id, u.name, u.email
         FROM users u
         JOIN tenant_members tm ON tm.user_id = u.id
         WHERE u.id = ? AND tm.tenant_id = ?`,
        [userId, req.tenantId]
      );
    if (!user) {
      return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    }

    const byVehicle = await db.queryMany(`
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
        AND (? IS NULL OR v.tenant_id = ?)
        AND r.status = 'completed'
        AND r.km_driven IS NOT NULL
        AND r.date >= ?
        AND r.date <= ?
      GROUP BY v.id, v.name, v.license_plate, v.price_per_km, v.flat_fee
      ORDER BY total_km DESC, trips DESC, v.name ASC
    `, [userId, req.tenantId, req.tenantId, from, to]);

    const totals = await db.queryOne(`
      SELECT
        COUNT(r.id) as total_trips,
        COALESCE(SUM(r.km_driven), 0) as total_km
      FROM reservations r
      JOIN vehicles v ON v.id = r.vehicle_id
      WHERE r.user_id = ?
        AND (? IS NULL OR v.tenant_id = ?)
        AND r.status = 'completed'
        AND r.km_driven IS NOT NULL
        AND r.date >= ?
        AND r.date <= ?
    `, [userId, req.tenantId, req.tenantId, from, to]);

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
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Laden der KM-Zusammenfassung' });
  }
});

export default router;
