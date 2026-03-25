import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db/client.js';
import { JWT_SECRET } from '../middleware/auth.js';

const router = Router();

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
    const role = userCount === 0 ? 'admin' : 'user';

    const hash = await bcrypt.hash(password, 10);
    const { lastInsertId, row } = await db.execute(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?) RETURNING id',
      [name, email, hash, role]
    );
    const id = row?.id ?? lastInsertId;

    const user = { id, name, email, role };
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registrierung fehlgeschlagen' });
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

    const user = { id: row.id, name: row.name, email: row.email, role: row.role };
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login fehlgeschlagen' });
  }
});

export default router;
