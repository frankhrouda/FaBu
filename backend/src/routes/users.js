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

export default router;
