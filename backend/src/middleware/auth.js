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
      'SELECT id, name, email, role FROM users WHERE id = ?',
      [payload.id]
    );

    if (!user) {
      return res.status(401).json({ error: 'Benutzer für dieses Token nicht gefunden. Bitte neu anmelden.' });
    }

    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Token ungültig oder abgelaufen' });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Administratorrechte erforderlich' });
  }
  next();
}
