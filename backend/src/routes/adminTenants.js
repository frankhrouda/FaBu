import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db/client.js';
import { authenticate, requireSuperAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/tenants', authenticate, requireSuperAdmin, async (_req, res) => {
  try {
    const tenants = await db.queryMany(
      `SELECT
         t.id,
         t.name,
         t.created_by,
         t.created_at,
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
       ORDER BY t.name ASC`,
      []
    );

    res.json({ tenants, total: tenants.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Laden der Mandanten' });
  }
});

router.post('/tenants', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { name, first_admin_email, description } = req.body || {};
    if (!name || String(name).trim().length < 2) {
      return res.status(400).json({ error: 'Mandantenname ist erforderlich' });
    }

    const existing = await db.queryOne('SELECT id FROM tenants WHERE name = ?', [String(name).trim()]);
    if (existing) {
      return res.status(409).json({ error: 'Mandant mit diesem Namen existiert bereits' });
    }

    const inserted = await db.execute(
      'INSERT INTO tenants (name, created_by) VALUES (?, ?) RETURNING id',
      [String(name).trim(), req.user.id]
    );
    const tenantId = inserted.row?.id ?? inserted.lastInsertId;

    if (first_admin_email) {
      const adminUser = await db.queryOne(
        'SELECT id, super_admin FROM users WHERE LOWER(email) = ?',
        [String(first_admin_email).trim().toLowerCase()]
      );
      if (!adminUser) {
        return res.status(404).json({ error: 'Benutzer fuer first_admin_email nicht gefunden' });
      }

      if (!adminUser.super_admin) {
        const existingMembership = await db.queryOne(
          'SELECT tenant_id FROM tenant_members WHERE user_id = ? LIMIT 1',
          [adminUser.id]
        );
        if (existingMembership) {
          return res.status(409).json({ error: 'Benutzer ist bereits einem anderen Mandanten zugeordnet' });
        }
      }

      await db.execute(
        'INSERT INTO tenant_members (tenant_id, user_id, role) VALUES (?, ?, ?) RETURNING id',
        [tenantId, adminUser.id, 'admin']
      );
    }

    const tenant = await db.queryOne('SELECT id, name, created_by, created_at FROM tenants WHERE id = ?', [tenantId]);

    res.status(201).json({
      tenant: {
        ...tenant,
        description: description ?? null,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Erstellen des Mandanten' });
  }
});

router.patch('/tenants/:tenantId', authenticate, requireSuperAdmin, async (req, res) => {
  const tenantId = Number(req.params.tenantId);
  const { name } = req.body || {};

  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    return res.status(400).json({ error: 'Ungueltige Mandanten-ID' });
  }
  if (!name || String(name).trim().length < 2) {
    return res.status(400).json({ error: 'Mandantenname ist erforderlich' });
  }

  try {
    const tenant = await db.queryOne('SELECT id, name FROM tenants WHERE id = ?', [tenantId]);
    if (!tenant) {
      return res.status(404).json({ error: 'Mandant nicht gefunden' });
    }

    const duplicate = await db.queryOne('SELECT id FROM tenants WHERE name = ? AND id != ?', [String(name).trim(), tenantId]);
    if (duplicate) {
      return res.status(409).json({ error: 'Mandantenname ist bereits vergeben' });
    }

    await db.execute('UPDATE tenants SET name = ? WHERE id = ?', [String(name).trim(), tenantId]);
    const updated = await db.queryOne('SELECT id, name, created_by, created_at FROM tenants WHERE id = ?', [tenantId]);
    res.json({ success: true, tenant: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Aktualisieren des Mandanten' });
  }
});

router.get('/tenant-admin-requests', authenticate, requireSuperAdmin, async (req, res) => {
  const status = req.query?.status ? String(req.query.status) : 'pending';
  const allowedStatuses = ['pending', 'approved', 'rejected', 'all'];
  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ error: 'Ungueltiger Statusfilter' });
  }

  try {
    const requests = status === 'all'
      ? await db.queryMany(
        `SELECT id, name, email, tenant_name, message, status, tenant_id, approved_user_id, decided_by, decided_at, created_at
         FROM tenant_admin_requests
         ORDER BY created_at DESC`,
        []
      )
      : await db.queryMany(
        `SELECT id, name, email, tenant_name, message, status, tenant_id, approved_user_id, decided_by, decided_at, created_at
         FROM tenant_admin_requests
         WHERE status = ?
         ORDER BY created_at DESC`,
        [status]
      );

    res.json({ requests });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Laden der Anfragen' });
  }
});

router.post('/tenant-admin-requests/:requestId/approve', authenticate, requireSuperAdmin, async (req, res) => {
  const requestId = Number(req.params.requestId);
  const overrideTenantName = req.body?.tenant_name ? String(req.body.tenant_name).trim() : null;

  if (!Number.isInteger(requestId) || requestId <= 0) {
    return res.status(400).json({ error: 'Ungueltige Anfrage-ID' });
  }

  try {
    const request = await db.queryOne(
      `SELECT id, name, email, tenant_name, password_hash, status
       FROM tenant_admin_requests
       WHERE id = ?`,
      [requestId]
    );
    if (!request) {
      return res.status(404).json({ error: 'Anfrage nicht gefunden' });
    }
    if (request.status !== 'pending') {
      return res.status(409).json({ error: 'Anfrage ist bereits bearbeitet' });
    }

    const tenantName = overrideTenantName && overrideTenantName.length >= 2
      ? overrideTenantName
      : request.tenant_name;

    let tenant = await db.queryOne('SELECT id, name FROM tenants WHERE name = ?', [tenantName]);
    if (!tenant) {
      const insertedTenant = await db.execute(
        'INSERT INTO tenants (name, created_by) VALUES (?, ?) RETURNING id',
        [tenantName, req.user.id]
      );
      const tenantId = insertedTenant.row?.id ?? insertedTenant.lastInsertId;
      tenant = await db.queryOne('SELECT id, name FROM tenants WHERE id = ?', [tenantId]);
    }

    let user = await db.queryOne('SELECT id, email, super_admin FROM users WHERE LOWER(email) = ?', [String(request.email).toLowerCase()]);
    if (!user) {
      if (!request.password_hash) {
        return res.status(409).json({ error: 'Antragsteller hat kein Konto und kein Passwort hinterlegt' });
      }

      const createdUser = await db.execute(
        'INSERT INTO users (name, email, password, role, super_admin) VALUES (?, ?, ?, ?, ?) RETURNING id',
        [request.name, String(request.email).toLowerCase(), request.password_hash, 'user', 0]
      );
      const userId = createdUser.row?.id ?? createdUser.lastInsertId;
      user = await db.queryOne('SELECT id, email, super_admin FROM users WHERE id = ?', [userId]);
    } else if (!user.super_admin) {
      const existingMembership = await db.queryOne(
        'SELECT tenant_id FROM tenant_members WHERE user_id = ? AND tenant_id != ? LIMIT 1',
        [user.id, tenant.id]
      );
      if (existingMembership) {
        return res.status(409).json({ error: 'Benutzer ist bereits einem anderen Mandanten zugeordnet' });
      }
    }

    await db.execute(
      `INSERT INTO tenant_members (tenant_id, user_id, role)
       VALUES (?, ?, 'admin')`,
      [tenant.id, user.id]
    ).catch(async () => {
      await db.execute(
        'UPDATE tenant_members SET role = ? WHERE tenant_id = ? AND user_id = ?',
        ['admin', tenant.id, user.id]
      );
    });

    await db.execute(
      `UPDATE tenant_admin_requests
       SET status = 'approved',
           tenant_id = ?,
           approved_user_id = ?,
           decided_by = ?,
           decided_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [tenant.id, user.id, req.user.id, requestId]
    );

    res.json({ success: true, tenant, user: { id: user.id, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Annehmen der Anfrage' });
  }
});

router.post('/tenant-admin-requests/:requestId/reject', authenticate, requireSuperAdmin, async (req, res) => {
  const requestId = Number(req.params.requestId);
  const reason = req.body?.reason ? String(req.body.reason).trim() : null;

  if (!Number.isInteger(requestId) || requestId <= 0) {
    return res.status(400).json({ error: 'Ungueltige Anfrage-ID' });
  }

  try {
    const request = await db.queryOne('SELECT id, status FROM tenant_admin_requests WHERE id = ?', [requestId]);
    if (!request) {
      return res.status(404).json({ error: 'Anfrage nicht gefunden' });
    }
    if (request.status !== 'pending') {
      return res.status(409).json({ error: 'Anfrage ist bereits bearbeitet' });
    }

    await db.execute(
      `UPDATE tenant_admin_requests
       SET status = 'rejected',
           message = COALESCE(?, message),
           decided_by = ?,
           decided_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [reason, req.user.id, requestId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Ablehnen der Anfrage' });
  }
});

router.get('/tenants/:tenantId/members', authenticate, requireSuperAdmin, async (req, res) => {
  const tenantId = Number(req.params.tenantId);
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    return res.status(400).json({ error: 'Ungueltige Mandanten-ID' });
  }

  try {
    const tenant = await db.queryOne('SELECT id, name FROM tenants WHERE id = ?', [tenantId]);
    if (!tenant) {
      return res.status(404).json({ error: 'Mandant nicht gefunden' });
    }

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
      [tenantId]
    );

    res.json({ tenant, members });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Laden der Mandantenmitglieder' });
  }
});

router.post('/tenants/:tenantId/members', authenticate, requireSuperAdmin, async (req, res) => {
  const tenantId = Number(req.params.tenantId);
  const { name, email, password, role } = req.body || {};

  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    return res.status(400).json({ error: 'Ungueltige Mandanten-ID' });
  }

  const normalizedName = String(name || '').trim();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const rawPassword = String(password || '');
  const tenantRole = role === 'admin' ? 'admin' : 'user';

  if (!normalizedName || !normalizedEmail || !rawPassword) {
    return res.status(400).json({ error: 'Name, E-Mail und Passwort sind erforderlich' });
  }

  if (rawPassword.length < 6) {
    return res.status(400).json({ error: 'Passwort muss mindestens 6 Zeichen haben' });
  }

  try {
    const tenant = await db.queryOne('SELECT id, name FROM tenants WHERE id = ?', [tenantId]);
    if (!tenant) {
      return res.status(404).json({ error: 'Mandant nicht gefunden' });
    }

    const existingUser = await db.queryOne('SELECT id FROM users WHERE LOWER(email) = ?', [normalizedEmail]);
    if (existingUser) {
      return res.status(409).json({ error: 'E-Mail bereits registriert' });
    }

    const passwordHash = await bcrypt.hash(rawPassword, 10);
    const insertedUser = await db.execute(
      'INSERT INTO users (name, email, password, role, super_admin) VALUES (?, ?, ?, ?, ?) RETURNING id',
      [normalizedName, normalizedEmail, passwordHash, 'user', 0]
    );
    const userId = insertedUser.row?.id ?? insertedUser.lastInsertId;

    await db.execute(
      'INSERT INTO tenant_members (tenant_id, user_id, role) VALUES (?, ?, ?) RETURNING id',
      [tenantId, userId, tenantRole]
    );

    const created = await db.queryOne(
      `SELECT u.id, u.name, u.email, u.super_admin, tm.role AS tenant_role, tm.created_at AS joined_at
       FROM tenant_members tm
       JOIN users u ON u.id = tm.user_id
       WHERE tm.tenant_id = ? AND tm.user_id = ?`,
      [tenantId, userId]
    );

    res.status(201).json({ success: true, user: created, tenant: { id: tenant.id, name: tenant.name } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Anlegen des Benutzers' });
  }
});

router.patch('/tenants/:tenantId/members/:userId/role', authenticate, requireSuperAdmin, async (req, res) => {
  const tenantId = Number(req.params.tenantId);
  const userId = Number(req.params.userId);
  const { role } = req.body || {};

  if (!Number.isInteger(tenantId) || tenantId <= 0 || !Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: 'Ungueltige IDs' });
  }
  if (!['admin', 'user'].includes(role)) {
    return res.status(400).json({ error: 'Ungueltige Rolle' });
  }

  try {
    const membership = await db.queryOne(
      'SELECT id FROM tenant_members WHERE tenant_id = ? AND user_id = ?',
      [tenantId, userId]
    );
    if (!membership) {
      return res.status(404).json({ error: 'Mitgliedschaft nicht gefunden' });
    }

    await db.execute(
      'UPDATE tenant_members SET role = ? WHERE tenant_id = ? AND user_id = ?',
      [role, tenantId, userId]
    );

    const updated = await db.queryOne(
      `SELECT u.id, u.name, u.email, tm.role AS tenant_role
       FROM tenant_members tm
       JOIN users u ON u.id = tm.user_id
       WHERE tm.tenant_id = ? AND tm.user_id = ?`,
      [tenantId, userId]
    );

    res.json({ success: true, user: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Aendern der Rolle' });
  }
});

router.delete('/tenants/:tenantId', authenticate, requireSuperAdmin, async (req, res) => {
  const tenantId = Number(req.params.tenantId);
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    return res.status(400).json({ error: 'Ungueltige Mandanten-ID' });
  }

  try {
    const tenant = await db.queryOne('SELECT id, name FROM tenants WHERE id = ?', [tenantId]);
    if (!tenant) {
      return res.status(404).json({ error: 'Mandant nicht gefunden' });
    }

    const vehicleCountRow = await db.queryOne('SELECT COUNT(*) AS count FROM vehicles WHERE tenant_id = ?', [tenantId]);
    const vehicleCount = Number(vehicleCountRow?.count ?? 0);
    if (vehicleCount > 0) {
      return res.status(409).json({ error: 'Mandant kann nicht geloescht werden, solange Fahrzeuge zugeordnet sind' });
    }

    await db.execute('DELETE FROM tenant_members WHERE tenant_id = ?', [tenantId]);
    await db.execute('DELETE FROM invitation_codes WHERE tenant_id = ?', [tenantId]);
    await db.execute('DELETE FROM tenants WHERE id = ?', [tenantId]);

    res.json({ success: true, tenant_id: tenantId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Loeschen des Mandanten' });
  }
});

export default router;
