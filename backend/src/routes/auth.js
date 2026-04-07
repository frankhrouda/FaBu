import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { db } from '../db/client.js';
import { JWT_SECRET, authenticate, requireAdmin } from '../middleware/auth.js';
import { sendMail } from '../mail/mailer.js';

const APP_FRONTEND_URL = process.env.APP_FRONTEND_URL || 'https://app.fabu-online.de';

function welcomeMailHtml(name, tenantName) {
  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:40px 36px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="padding-bottom:6px;">
          <span style="font-size:24px;font-weight:bold;color:#4f46e5;">FaBu</span>
          <span style="font-size:13px;color:#9ca3af;margin-left:8px;">Digitales Fahrtenbuch</span>
        </td></tr>
        <tr><td style="border-top:1px solid #e5e7eb;padding-top:24px;padding-bottom:16px;">
          <h2 style="margin:0 0 16px;font-size:20px;color:#111827;">Willkommen bei FaBu</h2>
          <p style="margin:0 0 8px;color:#374151;font-size:15px;">Hallo ${name},</p>
          <p style="margin:0 0 8px;color:#374151;font-size:15px;line-height:1.5;">
            dein Konto wurde erfolgreich erstellt.
          </p>
          <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.5;">
            Aktiver Mandant: <strong>${tenantName || 'FaBu'}</strong>
          </p>
          <a href="${APP_FRONTEND_URL}"
             style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:13px 28px;border-radius:8px;font-weight:bold;font-size:15px;">
            Jetzt anmelden
          </a>
        </td></tr>
        <tr><td style="border-top:1px solid #e5e7eb;padding-top:20px;">
          <p style="margin:0;color:#9ca3af;font-size:12px;">
            FaBu – Digitales Fahrtenbuch &nbsp;|&nbsp;
            <a href="https://fabu-online.de/impressum" style="color:#9ca3af;text-decoration:none;">Impressum</a>
            &nbsp;|&nbsp;
            <a href="https://fabu-online.de/datenschutz" style="color:#9ca3af;text-decoration:none;">Datenschutz</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function passwordResetHtml(name, resetLink) {
  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:40px 36px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="padding-bottom:6px;">
          <span style="font-size:24px;font-weight:bold;color:#4f46e5;">FaBu</span>
          <span style="font-size:13px;color:#9ca3af;margin-left:8px;">Digitales Fahrtenbuch</span>
        </td></tr>
        <tr><td style="border-top:1px solid #e5e7eb;padding-top:24px;padding-bottom:16px;">
          <h2 style="margin:0 0 16px;font-size:20px;color:#111827;">Passwort zurücksetzen</h2>
          <p style="margin:0 0 8px;color:#374151;font-size:15px;">Hallo ${name},</p>
          <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.5;">
            wir haben eine Anfrage erhalten, das Passwort für dein FaBu-Konto zurückzusetzen.
            Klicke auf den Button, um ein neues Passwort zu vergeben.
          </p>
          <a href="${resetLink}"
             style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:13px 28px;border-radius:8px;font-weight:bold;font-size:15px;">
            Passwort zurücksetzen
          </a>
          <p style="margin:24px 0 0;color:#6b7280;font-size:13px;">
            Dieser Link ist <strong>1 Stunde</strong> gültig.
          </p>
          <p style="margin:8px 0 0;color:#6b7280;font-size:13px;">
            Falls du kein neues Passwort angefordert hast, kannst du diese E-Mail ignorieren.
          </p>
        </td></tr>
        <tr><td style="border-top:1px solid #e5e7eb;padding-top:20px;">
          <p style="margin:0;color:#9ca3af;font-size:12px;">
            FaBu – Digitales Fahrtenbuch &nbsp;|&nbsp;
            <a href="https://fabu-online.de/impressum" style="color:#9ca3af;text-decoration:none;">Impressum</a>
            &nbsp;|&nbsp;
            <a href="https://fabu-online.de/datenschutz" style="color:#9ca3af;text-decoration:none;">Datenschutz</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

const router = Router();

const ALLOW_OPEN_REGISTRATION = process.env.ALLOW_OPEN_REGISTRATION === 'true';
const INVITATION_EXPIRES_HOURS = Number(process.env.INVITATION_EXPIRES_HOURS || 24);
const PASSWORD_RESET_COOLDOWN_MS = Number(process.env.PASSWORD_RESET_COOLDOWN_MS || 5 * 60 * 1000);

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

function getAccessibleTenants(user, memberships, activeTenantId) {
  if (user?.super_admin) {
    return memberships;
  }

  if (!activeTenantId) {
    return [];
  }

  return memberships.filter((membership) => Number(membership.id) === Number(activeTenantId));
}

function getDefaultActiveTenantId(user, memberships) {
  if (!memberships.length) {
    return null;
  }

  if (user?.super_admin) {
    return memberships[0].id;
  }

  const adminMembership = memberships.find((membership) => membership.role === 'admin');
  return adminMembership?.id ?? memberships[0].id;
}

function hasInvalidMultiTenantMembership(user, memberships) {
  return !user?.super_admin && memberships.length > 1;
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
    if (hasInvalidMultiTenantMembership({ super_admin: superAdmin }, memberships)) {
      return res.status(409).json({ error: 'Benutzer ist mehreren Mandanten zugeordnet. Bitte Superadmin kontaktieren.' });
    }

    if (!activeTenantId && memberships.length > 0) {
      activeTenantId = getDefaultActiveTenantId({ super_admin: superAdmin }, memberships);
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

    const activeTenantName = memberships.find((membership) => Number(membership.id) === Number(activeTenantId))?.name;
    sendMail({
      to: user.email,
      subject: 'Willkommen bei FaBu',
      html: welcomeMailHtml(user.name, activeTenantName),
    }).catch((mailErr) => console.error('[register] Welcome-Mail-Fehler:', mailErr));

    res.status(201).json({ token, user, available_tenants: getAccessibleTenants(user, memberships, activeTenantId) });
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
    if (hasInvalidMultiTenantMembership({ super_admin: false }, memberships)) {
      return res.status(409).json({ error: 'Benutzer ist mehreren Mandanten zugeordnet. Bitte Superadmin kontaktieren.' });
    }

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

    sendMail({
      to: user.email,
      subject: 'Willkommen bei FaBu',
      html: welcomeMailHtml(user.name, invite.tenant_name),
    }).catch((mailErr) => console.error('[register-with-invite] Welcome-Mail-Fehler:', mailErr));

    res.status(201).json({ token, user, available_tenants: getAccessibleTenants(user, memberships, activeTenantId), tenant_name: invite.tenant_name });
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

    const normalizedEmail = String(email).trim().toLowerCase();
    const row = await db.queryOne('SELECT * FROM users WHERE LOWER(email) = ?', [normalizedEmail]);
    if (!row) {
      const pendingRequest = await db.queryOne(
        `SELECT id
         FROM tenant_admin_requests
         WHERE LOWER(email) = ? AND status = 'pending'
         ORDER BY created_at DESC
         LIMIT 1`,
        [normalizedEmail]
      );

      if (pendingRequest) {
        return res.status(403).json({ error: 'Deine Anfrage wurde noch nicht vom Superadmin bearbeitet.' });
      }

      return res.status(401).json({ error: 'E-Mail-Adresse oder Passwort ist nicht korrekt.' });
    }

    const valid = await bcrypt.compare(password, row.password);
    if (!valid) return res.status(401).json({ error: 'E-Mail-Adresse oder Passwort ist nicht korrekt.' });

    const memberships = await getTenantMemberships(row.id);
    if (hasInvalidMultiTenantMembership({ super_admin: Boolean(row.super_admin) }, memberships)) {
      return res.status(409).json({ error: 'Benutzer ist mehreren Mandanten zugeordnet. Bitte Superadmin kontaktieren.' });
    }

    const activeTenantId = getDefaultActiveTenantId({ super_admin: Boolean(row.super_admin) }, memberships);
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
    res.json({ token, user, available_tenants: getAccessibleTenants(user, memberships, activeTenantId) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login fehlgeschlagen' });
  }
});

router.post('/switch-tenant/:tenantId', authenticate, async (req, res) => {
  try {
    if (!req.user.super_admin) {
      return res.status(403).json({ error: 'Nur Super-Admins duerfen den Mandanten wechseln' });
    }

    const requestedTenant = String(req.params.tenantId);
    const wantsAllTenants = requestedTenant === 'all';
    let tenantId = null;
    let tenant = null;

    if (!wantsAllTenants) {
      tenantId = Number(requestedTenant);
      if (!Number.isInteger(tenantId) || tenantId <= 0) {
        return res.status(400).json({ error: 'Ungültige Mandanten-ID' });
      }

      tenant = await db.queryOne('SELECT id, name FROM tenants WHERE id = ?', [tenantId]);
      if (!tenant) {
        return res.status(404).json({ error: 'Mandant nicht gefunden' });
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

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'E-Mail ist erforderlich' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await db.queryOne(
      'SELECT id, name, email FROM users WHERE LOWER(email) = ?',
      [normalizedEmail]
    );

    if (user) {
      const latestToken = await db.queryOne(
        `SELECT created_at
         FROM password_reset_tokens
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 1`,
        [user.id]
      );

      const latestTokenAt = latestToken?.created_at ? new Date(latestToken.created_at).getTime() : 0;
      const isInCooldown = latestTokenAt && (Date.now() - latestTokenAt) < PASSWORD_RESET_COOLDOWN_MS;

      if (isInCooldown) {
        return res.json({ message: 'Falls ein Konto mit dieser E-Mail existiert, wurde ein Link versendet.' });
      }

      // Alte, noch offene Tokens für diesen User ungültig machen
      await db.execute(
        'UPDATE password_reset_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL',
        [new Date().toISOString(), user.id]
      );

      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      await db.execute(
        'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
        [user.id, token, expiresAt]
      );

      const resetLink = `${APP_FRONTEND_URL}/reset-password?token=${token}`;

      sendMail({
        to: user.email,
        subject: 'FaBu – Passwort zurücksetzen',
        html: passwordResetHtml(user.name, resetLink),
      }).catch((err) => console.error('[forgot-password] Mail-Fehler:', err));
    }

    // Immer gleiche Antwort – gibt nicht preis, ob die E-Mail existiert
    res.json({ message: 'Falls ein Konto mit dieser E-Mail existiert, wurde ein Link versendet.' });
  } catch (err) {
    console.error('[forgot-password]', err);
    res.status(500).json({ error: 'Fehler beim Verarbeiten der Anfrage' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ error: 'Token und Passwort sind erforderlich' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Passwort muss mindestens 6 Zeichen haben' });
    }

    const tokenRow = await db.queryOne(
      'SELECT * FROM password_reset_tokens WHERE token = ? AND used_at IS NULL',
      [String(token).trim()]
    );

    if (!tokenRow || new Date(tokenRow.expires_at) <= new Date()) {
      return res.status(400).json({ error: 'Link ist ungültig oder abgelaufen' });
    }

    const hash = await bcrypt.hash(String(password), 10);
    await db.execute('UPDATE users SET password = ? WHERE id = ?', [hash, tokenRow.user_id]);
    await db.execute(
      'UPDATE password_reset_tokens SET used_at = ? WHERE id = ?',
      [new Date().toISOString(), tokenRow.id]
    );

    res.json({ message: 'Passwort erfolgreich geändert' });
  } catch (err) {
    console.error('[reset-password]', err);
    res.status(500).json({ error: 'Fehler beim Zurücksetzen des Passworts' });
  }
});

export default router;

