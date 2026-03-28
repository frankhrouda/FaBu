import { Router } from 'express';
import crypto from 'node:crypto';
import { db } from '../db/client.js';
import { authenticate, requireTenantAccess, requireTenantAdmin } from '../middleware/auth.js';

const router = Router();
const INVITATION_EXPIRES_HOURS = Number(process.env.INVITATION_EXPIRES_HOURS || 24);

function generateInvitationCode(length = 10) {
  const raw = crypto.randomBytes(16).toString('base64url').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return raw.slice(0, Math.max(6, length));
}

router.get('/:tenantId', authenticate, requireTenantAccess, async (req, res) => {
  try {
    const tenant = await db.queryOne('SELECT id, name, created_by, created_at FROM tenants WHERE id = ?', [req.tenantId]);
    if (!tenant) {
      return res.status(404).json({ error: 'Mandant nicht gefunden' });
    }

    const stats = await db.queryOne(
      `SELECT
         COALESCE(member_stats.user_count, 0) AS user_count,
         COALESCE(member_stats.admin_count, 0) AS admin_count,
         COALESCE(vehicle_stats.vehicle_count, 0) AS vehicle_count,
         COALESCE(res_stats.reservation_count, 0) AS reservation_count
       FROM tenants t
       LEFT JOIN (
         SELECT tenant_id, COUNT(*) AS user_count,
                SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) AS admin_count
         FROM tenant_members
         GROUP BY tenant_id
       ) member_stats ON member_stats.tenant_id = t.id
       LEFT JOIN (
         SELECT tenant_id, COUNT(*) AS vehicle_count
         FROM vehicles
         GROUP BY tenant_id
       ) vehicle_stats ON vehicle_stats.tenant_id = t.id
       LEFT JOIN (
         SELECT v.tenant_id, COUNT(r.id) AS reservation_count
         FROM reservations r
         JOIN vehicles v ON v.id = r.vehicle_id
         GROUP BY v.tenant_id
       ) res_stats ON res_stats.tenant_id = t.id
       WHERE t.id = ?`,
      [req.tenantId]
    );

    res.json({ tenant: { ...tenant, stats } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Laden des Mandanten' });
  }
});

router.get('/:tenantId/members', authenticate, requireTenantAccess, async (req, res) => {
  try {
    const members = await db.queryMany(
      `SELECT
         u.id,
         u.name,
         u.email,
         u.role,
         u.super_admin,
         tm.role AS tenant_role,
         tm.created_at AS joined_at
       FROM tenant_members tm
       JOIN users u ON u.id = tm.user_id
       WHERE tm.tenant_id = ?
       ORDER BY tm.role DESC, u.name ASC`,
      [req.tenantId]
    );

    res.json({ members });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Laden der Mitglieder' });
  }
});

router.get('/:tenantId/invitations', authenticate, requireTenantAdmin, async (req, res) => {
  try {
    const invitations = await db.queryMany(
      `SELECT
         ic.id,
         ic.tenant_id,
         ic.code,
         ic.email,
         ic.created_by,
         ic.used_by,
         ic.expires_at,
         ic.created_at,
         ic.used_at,
         creator.email AS created_by_email,
         used.email AS used_by_email
       FROM invitation_codes ic
       LEFT JOIN users creator ON creator.id = ic.created_by
       LEFT JOIN users used ON used.id = ic.used_by
       WHERE ic.tenant_id = ?
       ORDER BY ic.created_at DESC`,
      [req.tenantId]
    );

    res.json({ invitations });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Laden der Einladungen' });
  }
});

router.post('/:tenantId/invitations', authenticate, requireTenantAdmin, async (req, res) => {
  try {
    const email = req.body?.email ? String(req.body.email).trim().toLowerCase() : null;
    const expiresHours = Math.max(1, Number(req.body?.expires_in_hours || INVITATION_EXPIRES_HOURS));
    const expiresAt = new Date(Date.now() + expiresHours * 60 * 60 * 1000).toISOString();

    let code;
    let inserted = null;
    for (let i = 0; i < 5 && !inserted; i += 1) {
      code = generateInvitationCode(10);
      try {
        inserted = await db.execute(
          'INSERT INTO invitation_codes (tenant_id, code, email, created_by, expires_at) VALUES (?, ?, ?, ?, ?) RETURNING id',
          [req.tenantId, code, email, req.user.id, expiresAt]
        );
      } catch {
        inserted = null;
      }
    }

    if (!inserted) {
      return res.status(500).json({ error: 'Einladungscode konnte nicht erstellt werden' });
    }

    res.status(201).json({
      invitation: {
        id: inserted.row?.id ?? inserted.lastInsertId,
        tenant_id: req.tenantId,
        code,
        email,
        expires_at: expiresAt,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Einladung konnte nicht erstellt werden' });
  }
});

router.patch('/:tenantId/members/:userId/role', authenticate, requireTenantAdmin, async (req, res) => {
  const userId = Number(req.params.userId);
  const { role } = req.body || {};

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: 'Ungueltige Benutzer-ID' });
  }
  if (!['admin', 'user'].includes(role)) {
    return res.status(400).json({ error: 'Ungueltige Rolle' });
  }
  if (userId === req.user.id) {
    return res.status(400).json({ error: 'Eigene Rolle kann nicht geaendert werden' });
  }

  try {
    const member = await db.queryOne(
      'SELECT user_id FROM tenant_members WHERE tenant_id = ? AND user_id = ?',
      [req.tenantId, userId]
    );
    if (!member) {
      return res.status(404).json({ error: 'Mitglied nicht gefunden' });
    }

    await db.execute(
      'UPDATE tenant_members SET role = ? WHERE tenant_id = ? AND user_id = ?',
      [role, req.tenantId, userId]
    );

    const updated = await db.queryOne(
      `SELECT u.id, u.name, u.email, tm.role AS tenant_role
       FROM tenant_members tm
       JOIN users u ON u.id = tm.user_id
       WHERE tm.tenant_id = ? AND tm.user_id = ?`,
      [req.tenantId, userId]
    );

    res.json({ success: true, user: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Aendern der Rolle' });
  }
});

router.delete('/:tenantId/members/:userId', authenticate, requireTenantAdmin, async (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: 'Ungueltige Benutzer-ID' });
  }
  if (userId === req.user.id) {
    return res.status(400).json({ error: 'Eigener Account kann nicht entfernt werden' });
  }

  try {
    const exists = await db.queryOne(
      'SELECT user_id FROM tenant_members WHERE tenant_id = ? AND user_id = ?',
      [req.tenantId, userId]
    );
    if (!exists) {
      return res.status(404).json({ error: 'Mitglied nicht gefunden' });
    }

    await db.execute('DELETE FROM tenant_members WHERE tenant_id = ? AND user_id = ?', [req.tenantId, userId]);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Entfernen des Mitglieds' });
  }
});

export default router;
