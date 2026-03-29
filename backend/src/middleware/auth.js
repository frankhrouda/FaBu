import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { db } from '../db/client.js';

const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) {
  throw new Error('JWT_SECRET is required. Set it in the environment before starting the backend.');
}

export const JWT_SECRET = jwtSecret;

export async function authenticate(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Nicht autorisiert' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload?.id) {
      return res.status(401).json({ error: 'Token ungültig oder abgelaufen' });
    }

    // Always hydrate user from the active DB (prevents stale tokens across DB switches).
    const user = await db.queryOne(
      'SELECT id, name, email, role, super_admin FROM users WHERE id = ?',
      [payload.id]
    );

    if (!user) {
      return res.status(401).json({ error: 'Benutzer für dieses Token nicht gefunden. Bitte neu anmelden.' });
    }

    const requestedTenantId = payload.active_tenant_id ?? null;
    let tenantRole = null;

    if (requestedTenantId != null && !user.super_admin) {
      const membership = await db.queryOne(
        'SELECT role FROM tenant_members WHERE tenant_id = ? AND user_id = ?',
        [requestedTenantId, user.id]
      );
      if (!membership) {
        return res.status(403).json({ error: 'Kein Zugriff auf diesen Mandanten' });
      }
      tenantRole = membership.role;
    }

    req.user = user;
    req.tenantId = requestedTenantId;
    req.tenantRole = tenantRole;
    next();
  } catch {
    res.status(401).json({ error: 'Token ungültig oder abgelaufen' });
  }
}

export function requireAdmin(req, res, next) {
  const isSuperAdmin = Boolean(req.user?.super_admin);
  const isTenantAdmin = req.tenantRole === 'admin';
  if (!isSuperAdmin && !isTenantAdmin) {
    return res.status(403).json({ error: 'Administratorrechte erforderlich' });
  }
  next();
}

export function requireSuperAdmin(req, res, next) {
  if (!req.user?.super_admin) {
    return res.status(403).json({ error: 'Super-Admin-Rechte erforderlich' });
  }
  next();
}

export async function requireTenantAccess(req, res, next) {
  const tenantId = Number(req.params.tenantId ?? req.tenantId);
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    return res.status(400).json({ error: 'Ungueltige Mandanten-ID' });
  }

  if (req.user?.super_admin) {
    req.tenantId = tenantId;
    req.tenantRole = req.tenantRole ?? 'admin';
    return next();
  }

  if (Number(req.tenantId) !== tenantId) {
    return res.status(403).json({ error: 'Kein Zugriff auf diesen Mandanten' });
  }

  const membership = await db.queryOne(
    'SELECT role FROM tenant_members WHERE tenant_id = ? AND user_id = ?',
    [tenantId, req.user.id]
  );

  if (!membership) {
    return res.status(403).json({ error: 'Kein Zugriff auf diesen Mandanten' });
  }

  req.tenantId = tenantId;
  req.tenantRole = membership.role;
  return next();
}

export async function requireTenantAdmin(req, res, next) {
  const tenantId = Number(req.params.tenantId ?? req.tenantId);
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    return res.status(400).json({ error: 'Ungueltige Mandanten-ID' });
  }

  if (req.user?.super_admin) {
    req.tenantId = tenantId;
    req.tenantRole = 'admin';
    return next();
  }

  if (Number(req.tenantId) !== tenantId) {
    return res.status(403).json({ error: 'Administratorrechte fuer diesen Mandanten erforderlich' });
  }

  const membership = await db.queryOne(
    'SELECT role FROM tenant_members WHERE tenant_id = ? AND user_id = ?',
    [tenantId, req.user.id]
  );

  if (!membership || membership.role !== 'admin') {
    return res.status(403).json({ error: 'Administratorrechte fuer diesen Mandanten erforderlich' });
  }

  req.tenantId = tenantId;
  req.tenantRole = membership.role;
  return next();
}
