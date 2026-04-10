import { Router } from 'express';
import { db } from '../db/client.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { triggerAutoFill } from './waitlist.js';
import { sendMail } from '../mail/mailer.js';

const router = Router();

/**
 * Berechnet reminder_at_utc: Die UTC-Zeit, zu der die Erinnerung versendet werden soll.
 * reminder_at_utc = startDateTime - reminder_minutes_before
 * 
 * @param {string} date - YYYY-MM-DD
 * @param {string} time - HH:MM or HH:MM:SS
 * @param {number} reminderMinutesBefore - Minuten vor Start
 * @returns {string} ISO 8601 UTC string (YYYY-MM-DDTHH:MM:SSZ)
 */
function calculateReminderAtUtc(date, time, reminderMinutesBefore) {
  // Parse date + time zu lokalem DateTime
  const datetimeStr = `${date}T${time}`;
  const localDate = new Date(datetimeStr);

  // Substrahiere reminder_minutes_before
  const reminderDate = new Date(
    localDate.getTime() - reminderMinutesBefore * 60 * 1000
  );

  // Rückgabe als ISO 8601 UTC String
  return reminderDate.toISOString();
}

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

const WITH_DETAILS = `
  SELECT r.*, u.name as user_name, u.email as user_email,
         v.name as vehicle_name, v.license_plate, v.image_path as vehicle_image_path
  FROM reservations r
  JOIN users u ON r.user_id = u.id
  JOIN vehicles v ON r.vehicle_id = v.id
`;

function reservationCreatedHtml(reservation) {
  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:40px 36px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="padding-bottom:6px;">
          <span style="font-size:24px;font-weight:bold;color:#4f46e5;">FaBu</span>
          <span style="font-size:13px;color:#9ca3af;margin-left:8px;">Digitales Fahrtenbuch</span>
        </td></tr>
        <tr><td style="border-top:1px solid #e5e7eb;padding-top:24px;padding-bottom:16px;">
          <h2 style="margin:0 0 16px;font-size:20px;color:#111827;">Reservierung bestätigt</h2>
          <p style="margin:0 0 8px;color:#374151;font-size:15px;">Hallo ${reservation.user_name},</p>
          <p style="margin:0 0 18px;color:#374151;font-size:15px;line-height:1.5;">
            deine Reservierung wurde erfolgreich angelegt.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px;">
            <tr><td style="font-size:14px;color:#111827;padding:6px 0;"><strong>Fahrzeug:</strong> ${reservation.vehicle_name} (${reservation.license_plate})</td></tr>
            <tr><td style="font-size:14px;color:#111827;padding:6px 0;"><strong>Von:</strong> ${reservation.date} ${reservation.time_from}</td></tr>
            <tr><td style="font-size:14px;color:#111827;padding:6px 0;"><strong>Bis:</strong> ${reservation.date_to} ${reservation.time_to}</td></tr>
            <tr><td style="font-size:14px;color:#111827;padding:6px 0;"><strong>Grund:</strong> ${reservation.reason}</td></tr>
          </table>
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

router.get('/', authenticate, async (req, res) => {
  if (requireTenantContext(req, res, { allowSuperAdminWithoutTenant: true })) return;
  try {
    const isAdmin = req.user.super_admin || req.tenantRole === 'admin';
    const reservationOrderBy = 'ORDER BY r.created_at DESC, r.id DESC';
    const reservations = req.user.super_admin && !req.tenantId
      ? await db.queryMany(`${WITH_DETAILS} ${reservationOrderBy}`, [])
      : isAdmin
        ? await db.queryMany(`${WITH_DETAILS} WHERE v.tenant_id = ? ${reservationOrderBy}`, [req.tenantId])
        : await db.queryMany(`${WITH_DETAILS} WHERE r.user_id = ? AND v.tenant_id = ? ${reservationOrderBy}`, [req.user.id, req.tenantId]);
    res.json(reservations);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Laden der Reservierungen' });
  }
});

router.get('/availability', authenticate, async (req, res) => {
  if (requireTenantContext(req, res)) return;
  const { vehicle_id, date, date_to, time_from, time_to, exclude_id } = req.query;
  if (!vehicle_id || !date || !time_from || !time_to) {
    return res.status(400).json({ error: 'Parameter fehlen' });
  }

  const vehicle = await db.queryOne(
    'SELECT id FROM vehicles WHERE id = ? AND active = TRUE AND tenant_id = ?',
    [vehicle_id, req.tenantId]
  );
  if (!vehicle) {
    return res.status(404).json({ error: 'Fahrzeug nicht aktiv oder nicht gefunden' });
  }

  const endDate = date_to || date;
  let query = `
    SELECT r.id FROM reservations r
    JOIN vehicles v ON v.id = r.vehicle_id
    WHERE r.vehicle_id = ? AND r.status != 'cancelled'
    AND v.tenant_id = ?
    AND (date || ' ' || time_from) < (? || ' ' || ?)
    AND (COALESCE(date_to, date) || ' ' || time_to) > (? || ' ' || ?)
  `;
  const params = [vehicle_id, req.tenantId, endDate, time_to, date, time_from];

  if (exclude_id) {
    query += ' AND id != ?';
    params.push(exclude_id);
  }

  try {
    const conflict = await db.queryOne(query, params);
    res.json({ available: !conflict });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler bei der Verfügbarkeitsprüfung' });
  }
});

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
    const vehicle = await db.queryOne('SELECT id FROM vehicles WHERE id = ? AND active = TRUE AND tenant_id = ?', [vehicle_id, req.tenantId]);
    if (!vehicle) return res.status(404).json({ error: 'Fahrzeug nicht gefunden' });

    const conflict = await db.queryOne(`
      SELECT r.id FROM reservations r
      JOIN vehicles v ON v.id = r.vehicle_id
      WHERE r.vehicle_id = ? AND r.status != 'cancelled'
      AND v.tenant_id = ?
      AND (date || ' ' || time_from) < (? || ' ' || ?)
      AND (COALESCE(date_to, date) || ' ' || time_to) > (? || ' ' || ?)
    `, [vehicle_id, req.tenantId, endDate, time_to, date, time_from]);

    if (conflict) {
      return res.status(409).json({ error: 'Fahrzeug ist in diesem Zeitraum bereits reserviert' });
    }

    const { lastInsertId, row } = await db.execute(
      'INSERT INTO reservations (user_id, vehicle_id, date, date_to, time_from, time_to, reason, reminder_minutes_before, reminder_at_utc, reminder_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        req.user.id,
        vehicle_id,
        date,
        endDate,
        time_from,
        time_to,
        reason.trim(),
        60,  // Default: 60 minutes before
        calculateReminderAtUtc(date, time_from, 60),  // Calculate reminder time
        'pending'
      ]
    );
    const id = row?.id ?? lastInsertId;

    const reservation = await db.queryOne(`${WITH_DETAILS} WHERE r.id = ?`, [id]);

    sendMail({
      to: reservation.user_email,
      subject: 'FaBu – Reservierung bestätigt',
      html: reservationCreatedHtml(reservation),
    }).catch((mailErr) => console.error('[reservation.created] Mail-Fehler:', mailErr));

    res.status(201).json(reservation);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Erstellen der Reservierung' });
  }
});

router.patch('/:id/complete', authenticate, async (req, res) => {
  if (requireTenantContext(req, res)) return;
  const { km_driven, destination } = req.body;
  if (!km_driven || !destination) {
    return res.status(400).json({ error: 'Kilometer und Zielort sind erforderlich' });
  }
  if (km_driven < 1) {
    return res.status(400).json({ error: 'Kilometer muss größer als 0 sein' });
  }

  try {
    const reservation = await db.queryOne(
      `SELECT r.*
       FROM reservations r
       JOIN vehicles v ON v.id = r.vehicle_id
       WHERE r.id = ? AND v.tenant_id = ?`,
      [req.params.id, req.tenantId]
    );
    if (!reservation) return res.status(404).json({ error: 'Reservierung nicht gefunden' });

    if (reservation.user_id !== req.user.id && req.tenantRole !== 'admin' && !req.user.super_admin) {
      return res.status(403).json({ error: 'Keine Berechtigung' });
    }
    if (reservation.status !== 'reserved') {
      return res.status(400).json({ error: 'Reservierung kann nicht abgeschlossen werden' });
    }

    await db.execute(
      "UPDATE reservations SET km_driven=?, destination=?, status='completed' WHERE id=?",
      [Number(km_driven), destination.trim(), req.params.id]
    );

    const updated = await db.queryOne(`${WITH_DETAILS} WHERE r.id = ?`, [req.params.id]);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Abschließen der Reservierung' });
  }
});

router.patch('/:id/cancel', authenticate, async (req, res) => {
  if (requireTenantContext(req, res)) return;
  try {
    const reservation = await db.queryOne(
      `SELECT r.*
       FROM reservations r
       JOIN vehicles v ON v.id = r.vehicle_id
       WHERE r.id = ? AND v.tenant_id = ?`,
      [req.params.id, req.tenantId]
    );
    if (!reservation) return res.status(404).json({ error: 'Reservierung nicht gefunden' });

    if (reservation.user_id !== req.user.id && req.tenantRole !== 'admin' && !req.user.super_admin) {
      return res.status(403).json({ error: 'Keine Berechtigung' });
    }
    if (reservation.status !== 'reserved') {
      return res.status(400).json({ error: 'Nur aktive Reservierungen können storniert werden' });
    }

    await db.execute("UPDATE reservations SET status = 'cancelled' WHERE id = ?", [req.params.id]);
    // Wartelisten-Kandidaten für diesen Slot benachrichtigen
    await triggerAutoFill(
      reservation.vehicle_id,
      reservation.date,
      reservation.date_to,
      reservation.time_from,
      reservation.time_to,
      req.tenantId
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Stornieren der Reservierung' });
  }
});

router.get('/vehicle/:vehicle_id', authenticate, async (req, res) => {
  if (requireTenantContext(req, res)) return;
  try {
    const reservations = await db.queryMany(
      `${WITH_DETAILS} WHERE r.vehicle_id = ? AND v.tenant_id = ? AND r.status != 'cancelled' ORDER BY r.date ASC, r.time_from ASC`,
      [req.params.vehicle_id, req.tenantId]
    );
    res.json(reservations);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Laden der Fahrzeug-Reservierungen' });
  }
});

export default router;
