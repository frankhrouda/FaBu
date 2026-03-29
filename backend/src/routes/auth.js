import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { db } from '../db/client.js';
import { JWT_SECRET, authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();

const ALLOW_OPEN_REGISTRATION = process.env.ALLOW_OPEN_REGISTRATION === 'true';
const INVITATION_EXPIRES_HOURS = Number(process.env.INVITATION_EXPIRES_HOURS || 24);

async function getTenantMemberships(userId) {
  return db.queryMany(
    `SELECT t.id, t.name, tm.role
     FROM tenant_members tm
     JOIN tenants t ON t.id = tm.tenant_id
     WHERE tm.user_id = ?
     ORDER BY t.name ASC`,
    [userId]
  );
}

function buildTokenPayload({ id, role, superAdmin, activeTenantId }) {
  return {
    id,
    role,
    super_admin: Boolean(superAdmin),
    active_tenant_id: activeTenantId ?? null,
  };
}

function generateInvitationCode(length = 10) {
  const raw = crypto.randomBytes(16).toString('base64url').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return raw.slice(0, Math.max(6, length));
}

router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Alle Felder sind erforderlich' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Passwort muss mindestens 6 Zeichen haben' });
    }

    const existing = await db.queryOne('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) return res.status(409).json({ error: 'E-Mail bereits registriert' });

    const countRow = await db.queryOne('SELECT COUNT(*) as count FROM users', []);
    const userCount = Number(countRow?.count ?? 0);
    if (userCount > 0 && !ALLOW_OPEN_REGISTRATION) {
      return res.status(403).json({ error: 'Registrierung nur mit Einladung möglich' });
    }

    const role = userCount === 0 ? 'admin' : 'user';
    const superAdmin = userCount === 0;

    const hash = await bcrypt.hash(password, 10);
    const { lastInsertId, row } = await db.execute(
      'INSERT INTO users (name, email, password, role, super_admin) VALUES (?, ?, ?, ?, ?) RETURNING id',
      [name, email, hash, role, superAdmin]
    );
    const id = row?.id ?? lastInsertId;

    let activeTenantId = null;
    if (userCount === 0) {
      const tenantName = process.env.DEFAULT_TENANT_NAME || 'Default Tenant';
      const tenantInsert = await db.execute(
        'INSERT INTO tenants (name, created_by) VALUES (?, ?) RETURNING id',
        [tenantName, id]
      );
      activeTenantId = tenantInsert.row?.id ?? tenantInsert.lastInsertId;
      await db.execute(
        'INSERT INTO tenant_members (tenant_id, user_id, role) VALUES (?, ?, ?)',
        [activeTenantId, id, 'admin']
      );
    }

    const memberships = await getTenantMemberships(id);
    if (!activeTenantId && memberships.length > 0) {
      activeTenantId = memberships[0].id;
    }

    const user = {
      id,
      name,
      email,
      role,
      super_admin: superAdmin,
      active_tenant_id: activeTenantId,
    };
    const token = jwt.sign(
      buildTokenPayload({ id, role, superAdmin, activeTenantId }),
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.status(201).json({ token, user, available_tenants: memberships });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registrierung fehlgeschlagen' });
  }
});

router.post('/register-with-invite', async (req, res) => {
  try {
    const { code, name, email, password } = req.body;
    if (!code || !name || !email || !password) {
      return res.status(400).json({ error: 'Code, Name, E-Mail und Passwort sind erforderlich' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Passwort muss mindestens 6 Zeichen haben' });
    }

    const existing = await db.queryOne('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) return res.status(409).json({ error: 'E-Mail bereits registriert' });

    const invite = await db.queryOne(
      `SELECT ic.id, ic.tenant_id, ic.email, ic.used_at, ic.expires_at, t.name as tenant_name
       FROM invitation_codes ic
       JOIN tenants t ON t.id = ic.tenant_id
       WHERE ic.code = ?`,
      [String(code).trim().toUpperCase()]
    );

    if (!invite || invite.used_at) {
      return res.status(400).json({ error: 'Einladungscode ungültig oder bereits verwendet' });
    }

    if (invite.email && invite.email.toLowerCase() !== String(email).trim().toLowerCase()) {
      return res.status(400).json({ error: 'Einladungscode ist für eine andere E-Mail-Adresse vorgesehen' });
    }

    const expiresAt = new Date(invite.expires_at);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      return res.status(400).json({ error: 'Einladungscode ist abgelaufen' });
    }

    const hash = await bcrypt.hash(password, 10);
    const createdUser = await db.execute(
      'INSERT INTO users (name, email, password, role, super_admin) VALUES (?, ?, ?, ?, ?) RETURNING id',
      [name.trim(), String(email).trim().toLowerCase(), hash, 'user', 0]
    );
    const userId = createdUser.row?.id ?? createdUser.lastInsertId;

    await db.execute(
      'INSERT INTO tenant_members (tenant_id, user_id, role) VALUES (?, ?, ?)',
      [invite.tenant_id, userId, 'user']
    );

    await db.execute(
      'UPDATE invitation_codes SET used_by = ?, used_at = CURRENT_TIMESTAMP WHERE id = ?',
      [userId, invite.id]
    );

    const memberships = await getTenantMemberships(userId);
    const activeTenantId = invite.tenant_id;
    const user = {
      id: userId,
      name: name.trim(),
      email: String(email).trim().toLowerCase(),
      role: 'user',
      super_admin: false,
      active_tenant_id: activeTenantId,
    };

    const token = jwt.sign(
      buildTokenPayload({ id: userId, role: 'user', superAdmin: false, activeTenantId }),
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({ token, user, available_tenants: memberships, tenant_name: invite.tenant_name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registrierung mit Einladung fehlgeschlagen' });
  }
});

router.post('/tenant-admin-requests', async (req, res) => {
  try {
    const { name, email, tenant_name, password, message } = req.body || {};
    if (!name || !email || !tenant_name) {
      return res.status(400).json({ error: 'Name, E-Mail und Mandantenname sind erforderlich' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedTenantName = String(tenant_name).trim();
    const normalizedName = String(name).trim();
    const normalizedMessage = message ? String(message).trim() : null;

    if (normalizedTenantName.length < 2) {
      return res.status(400).json({ error: 'Mandantenname ist zu kurz' });
    }

    if (password && String(password).length < 6) {
      return res.status(400).json({ error: 'Passwort muss mindestens 6 Zeichen haben' });
    }

    const existingPending = await db.queryOne(
      `SELECT id FROM tenant_admin_requests
       WHERE email = ? AND tenant_name = ? AND status = 'pending'`,
      [normalizedEmail, normalizedTenantName]
    );
    if (existingPending) {
      return res.status(409).json({ error: 'Für diese E-Mail und diesen Mandanten existiert bereits eine offene Anfrage' });
    }

    const passwordHash = password ? await bcrypt.hash(String(password), 10) : null;

    const inserted = await db.execute(
      `INSERT INTO tenant_admin_requests (name, email, tenant_name, password_hash, message, status)
       VALUES (?, ?, ?, ?, ?, 'pending') RETURNING id`,
      [normalizedName, normalizedEmail, normalizedTenantName, passwordHash, normalizedMessage]
    );

    res.status(201).json({
      request: {
        id: inserted.row?.id ?? inserted.lastInsertId,
        name: normalizedName,
        email: normalizedEmail,
        tenant_name: normalizedTenantName,
        status: 'pending',
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Anfrage konnte nicht erstellt werden' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'E-Mail und Passwort erforderlich' });
    }

    const row = await db.queryOne('SELECT * FROM users WHERE email = ?', [email]);
    if (!row) return res.status(401).json({ error: 'E-Mail-Adresse oder Passwort ist nicht korrekt.' });

    const valid = await bcrypt.compare(password, row.password);
    if (!valid) return res.status(401).json({ error: 'E-Mail-Adresse oder Passwort ist nicht korrekt.' });

    const memberships = await getTenantMemberships(row.id);
    const activeTenantId = memberships[0]?.id ?? null;
    const user = {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      super_admin: Boolean(row.super_admin),
      active_tenant_id: activeTenantId,
    };
    const token = jwt.sign(
      buildTokenPayload({
        id: row.id,
        role: row.role,
        superAdmin: row.super_admin,
        activeTenantId,
      }),
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, user, available_tenants: memberships });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login fehlgeschlagen' });
  }
});

router.post('/switch-tenant/:tenantId', authenticate, async (req, res) => {
  try {
    const tenantId = Number(req.params.tenantId);
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
      return res.status(400).json({ error: 'Ungültige Mandanten-ID' });
    }

    const tenant = await db.queryOne('SELECT id, name FROM tenants WHERE id = ?', [tenantId]);
    if (!tenant) {
      return res.status(404).json({ error: 'Mandant nicht gefunden' });
    }

    if (!req.user.super_admin) {
      const membership = await db.queryOne(
        'SELECT role FROM tenant_members WHERE tenant_id = ? AND user_id = ?',
        [tenantId, req.user.id]
      );
      if (!membership) {
        return res.status(403).json({ error: 'Kein Zugriff auf diesen Mandanten' });
      }
    }

    const token = jwt.sign(
      buildTokenPayload({
        id: req.user.id,
        role: req.user.role,
        superAdmin: req.user.super_admin,
        activeTenantId: tenantId,
      }),
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        super_admin: Boolean(req.user.super_admin),
        active_tenant_id: tenantId,
      },
      tenant,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Mandantenwechsel fehlgeschlagen' });
  }
});

router.post('/invitations', authenticate, requireAdmin, async (req, res) => {
  try {
    const requestedTenantId = req.body?.tenant_id != null ? Number(req.body.tenant_id) : null;
    const tenantId = requestedTenantId ?? req.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Mandanten-ID erforderlich (tenant_id oder aktiver Mandant im Token)' });
    }

    if (!req.user.super_admin && Number(tenantId) !== Number(req.tenantId)) {
      return res.status(403).json({ error: 'Einladung nur für den aktiven Mandanten erlaubt' });
    }

    const tenant = await db.queryOne('SELECT id, name FROM tenants WHERE id = ?', [tenantId]);
    if (!tenant) {
      return res.status(404).json({ error: 'Mandant nicht gefunden' });
    }

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
          [tenantId, code, email, req.user.id, expiresAt]
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
        tenant_id: tenantId,
        tenant_name: tenant.name,
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

export default router;
