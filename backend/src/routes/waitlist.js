import { Router } from 'express';
import { db } from '../db/client.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Wie lange ein Angebot gültig ist (2 Stunden)
const OFFER_TTL_MS = 2 * 60 * 60 * 1000;

function requireTenantContext(req, res) {
  if (!req.tenantId) {
    res.status(400).json({ error: 'Aktiver Mandant erforderlich' });
    return true;
  }
  return false;
}

const WITH_DETAILS = `
  SELECT w.*, u.name as user_name, u.email as user_email,
         v.name as vehicle_name, v.license_plate
  FROM waitlist w
  JOIN users u ON u.id = w.user_id
  JOIN vehicles v ON v.id = w.vehicle_id
`;

/**
 * Wird nach jeder Slot-Freigabe (Stornierung) aufgerufen.
 * Verfallene Angebote bereinigen, dann den nächsten Kandidaten (FIFO) anbieten.
 */
export async function triggerAutoFill(vehicleId, date, dateTo, timeFrom, timeTo, tenantId) {
  try {
    const now = new Date().toISOString();

    // Abgelaufene Angebote für diesen Slot auf 'expired' setzen
    await db.execute(
      `UPDATE waitlist SET status = 'expired'
       WHERE vehicle_id = ? AND tenant_id = ?
         AND status = 'offered' AND expires_at < ?`,
      [vehicleId, tenantId, now]
    );

    // Nächsten passenden Kandidaten (FIFO) suchen
    const candidate = await db.queryOne(
      `SELECT * FROM waitlist
       WHERE vehicle_id = ? AND tenant_id = ? AND status = 'pending'
         AND date >= ? AND date_to <= ?
         AND time_from >= ? AND time_to <= ?
       ORDER BY created_at ASC
       LIMIT 1`,
      [vehicleId, tenantId, date, dateTo, timeFrom, timeTo]
    );

    if (!candidate) return null;

    const offeredAt = now;
    const expiresAt = new Date(Date.now() + OFFER_TTL_MS).toISOString();

    await db.execute(
      `UPDATE waitlist SET status = 'offered', offered_at = ?, expires_at = ? WHERE id = ?`,
      [offeredAt, expiresAt, candidate.id]
    );

    return candidate;
  } catch (err) {
    // AutoFill darf die Haupt-Anfrage nicht blockieren
    console.error('AutoFill Fehler:', err);
    return null;
  }
}

// GET /waitlist — eigene Einträge (Nutzer) oder alle im Tenant (Admin)
router.get('/', authenticate, async (req, res) => {
  if (requireTenantContext(req, res)) return;
  try {
    const isAdmin = req.user.super_admin || req.tenantRole === 'admin';
    const rows = isAdmin
      ? await db.queryMany(
          `${WITH_DETAILS} WHERE w.tenant_id = ? ORDER BY w.created_at DESC`,
          [req.tenantId]
        )
      : await db.queryMany(
          `${WITH_DETAILS} WHERE w.user_id = ? AND w.tenant_id = ? ORDER BY w.created_at DESC`,
          [req.user.id, req.tenantId]
        );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Laden der Warteliste' });
  }
});

// POST /waitlist — auf Warteliste eintragen
router.post('/', authenticate, async (req, res) => {
  if (requireTenantContext(req, res)) return;
  const { vehicle_id, date, date_to, time_from, time_to, reason } = req.body;
  if (!vehicle_id || !date || !time_from || !time_to || !reason) {
    return res.status(400).json({ error: 'Alle Felder sind erforderlich' });
  }
  const endDate = date_to || date;
  if (endDate < date) {
    return res.status(400).json({ error: 'Enddatum muss am oder nach dem Startdatum liegen' });
  }
  if (endDate === date && time_from >= time_to) {
    return res.status(400).json({ error: 'Endzeit muss nach Startzeit liegen' });
  }

  try {
    const vehicle = await db.queryOne(
      'SELECT id FROM vehicles WHERE id = ? AND active = TRUE AND tenant_id = ?',
      [vehicle_id, req.tenantId]
    );
    if (!vehicle) return res.status(404).json({ error: 'Fahrzeug nicht gefunden' });

    // Slot muss aktuell belegt sein — sonst direkt buchen
    const conflict = await db.queryOne(
      `SELECT r.id FROM reservations r
       JOIN vehicles v ON v.id = r.vehicle_id
       WHERE r.vehicle_id = ? AND r.status != 'cancelled'
         AND v.tenant_id = ?
         AND (date || ' ' || time_from) < (? || ' ' || ?)
         AND (COALESCE(date_to, date) || ' ' || time_to) > (? || ' ' || ?)`,
      [vehicle_id, req.tenantId, endDate, time_to, date, time_from]
    );
    if (!conflict) {
      return res.status(409).json({
        error: 'Fahrzeug ist in diesem Zeitraum verfügbar – bitte direkt reservieren',
      });
    }

    // Bereits in der Warteliste für denselben Slot?
    const duplicate = await db.queryOne(
      `SELECT id FROM waitlist
       WHERE user_id = ? AND vehicle_id = ? AND tenant_id = ?
         AND date = ? AND date_to = ? AND time_from = ? AND time_to = ?
         AND status IN ('pending', 'offered')`,
      [req.user.id, vehicle_id, req.tenantId, date, endDate, time_from, time_to]
    );
    if (duplicate) {
      return res.status(409).json({ error: 'Du stehst bereits auf der Warteliste für diesen Zeitraum' });
    }

    const { lastInsertId, row } = await db.execute(
      `INSERT INTO waitlist (tenant_id, user_id, vehicle_id, date, date_to, time_from, time_to, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [req.tenantId, req.user.id, vehicle_id, date, endDate, time_from, time_to, reason.trim()]
    );
    const id = row?.id ?? lastInsertId;

    const entry = await db.queryOne(`${WITH_DETAILS} WHERE w.id = ?`, [id]);
    res.status(201).json(entry);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Eintragen in die Warteliste' });
  }
});

// DELETE /waitlist/:id — eigenen Eintrag zurückziehen
router.delete('/:id', authenticate, async (req, res) => {
  if (requireTenantContext(req, res)) return;
  try {
    const entry = await db.queryOne(
      'SELECT * FROM waitlist WHERE id = ? AND tenant_id = ?',
      [req.params.id, req.tenantId]
    );
    if (!entry) return res.status(404).json({ error: 'Eintrag nicht gefunden' });

    const isAdmin = req.user.super_admin || req.tenantRole === 'admin';
    if (entry.user_id !== req.user.id && !isAdmin) {
      return res.status(403).json({ error: 'Keine Berechtigung' });
    }
    if (!['pending', 'offered'].includes(entry.status)) {
      return res.status(400).json({ error: 'Eintrag kann nicht mehr zurückgezogen werden' });
    }

    await db.execute("UPDATE waitlist SET status = 'cancelled' WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Zurückziehen des Eintrags' });
  }
});

// POST /waitlist/:id/accept — angebotenen Slot annehmen → Reservierung erstellen
router.post('/:id/accept', authenticate, async (req, res) => {
  if (requireTenantContext(req, res)) return;
  try {
    const entry = await db.queryOne(
      'SELECT * FROM waitlist WHERE id = ? AND user_id = ? AND tenant_id = ?',
      [req.params.id, req.user.id, req.tenantId]
    );
    if (!entry) return res.status(404).json({ error: 'Eintrag nicht gefunden' });
    if (entry.status !== 'offered') {
      return res.status(400).json({ error: 'Kein aktives Angebot vorhanden' });
    }
    if (new Date(entry.expires_at) < new Date()) {
      await db.execute("UPDATE waitlist SET status = 'expired' WHERE id = ?", [entry.id]);
      return res.status(410).json({ error: 'Das Angebot ist abgelaufen' });
    }

    // Race-Condition-Schutz: Slot nochmals prüfen
    const conflict = await db.queryOne(
      `SELECT r.id FROM reservations r
       JOIN vehicles v ON v.id = r.vehicle_id
       WHERE r.vehicle_id = ? AND r.status != 'cancelled'
         AND v.tenant_id = ?
         AND (date || ' ' || time_from) < (? || ' ' || ?)
         AND (COALESCE(date_to, date) || ' ' || time_to) > (? || ' ' || ?)`,
      [entry.vehicle_id, req.tenantId, entry.date_to, entry.time_to, entry.date, entry.time_from]
    );
    if (conflict) {
      return res.status(409).json({ error: 'Der Slot wurde inzwischen anderweitig belegt' });
    }

    // Reservierung anlegen
    const { lastInsertId, row } = await db.execute(
      `INSERT INTO reservations (user_id, vehicle_id, date, date_to, time_from, time_to, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [req.user.id, entry.vehicle_id, entry.date, entry.date_to, entry.time_from, entry.time_to, entry.reason]
    );
    const reservationId = row?.id ?? lastInsertId;

    // Wartelisten-Eintrag abschließen
    await db.execute(
      "UPDATE waitlist SET status = 'accepted', reservation_id = ? WHERE id = ?",
      [reservationId, entry.id]
    );

    // Alle anderen pending/offered Einträge für genau diesen Slot schließen
    await db.execute(
      `UPDATE waitlist SET status = 'cancelled'
       WHERE vehicle_id = ? AND tenant_id = ?
         AND date = ? AND date_to = ? AND time_from = ? AND time_to = ?
         AND status IN ('pending', 'offered') AND id != ?`,
      [entry.vehicle_id, req.tenantId, entry.date, entry.date_to, entry.time_from, entry.time_to, entry.id]
    );

    const WITH_RES = `
      SELECT r.*, u.name as user_name, u.email as user_email,
             v.name as vehicle_name, v.license_plate
      FROM reservations r
      JOIN users u ON r.user_id = u.id
      JOIN vehicles v ON r.vehicle_id = v.id
    `;
    const reservation = await db.queryOne(`${WITH_RES} WHERE r.id = ?`, [reservationId]);
    res.status(201).json(reservation);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Annehmen des Angebots' });
  }
});

export default router;
