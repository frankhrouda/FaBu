/**
 * Reminder Worker – Versendet Fahrt-Erinnerungen per Email
 *
 * Läuft permanent im Hintergrund und:
 * 1. Pollt jede Minute die Datenbank nach fälligen Reminders
 * 2. Versendet Emails (atomare Updateszu Verhindung von Duplikaten)
 * 3. Markiert reminder_sent_at und reminder_status = 'sent'
 *
 * Nur in Production aktiv (NODE_ENV === 'production')
 */

import 'dotenv/config';
import { db } from '../db/client.js';
import { sendMail } from '../mail/mailer.js';

const POLL_INTERVAL_MS = 60000; // 1 Minute

function reminderEmailHtml(reservation) {
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
          <h2 style="margin:0 0 16px;font-size:20px;color:#111827;">Fahrt-Erinnerung</h2>
          <p style="margin:0 0 8px;color:#374151;font-size:15px;">Hallo ${reservation.user_name},</p>
          <p style="margin:0 0 18px;color:#374151;font-size:15px;line-height:1.5;">
            deine Fahrt steht in Kürze an.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px;">
            <tr><td style="font-size:14px;color:#111827;padding:6px 0;"><strong>Fahrzeug:</strong> ${reservation.vehicle_name} (${reservation.license_plate})</td></tr>
            <tr><td style="font-size:14px;color:#111827;padding:6px 0;"><strong>Start:</strong> ${reservation.date} ${reservation.time_from}</td></tr>
            <tr><td style="font-size:14px;color:#111827;padding:6px 0;"><strong>Ende:</strong> ${reservation.date_to} ${reservation.time_to}</td></tr>
            <tr><td style="font-size:14px;color:#111827;padding:6px 0;"><strong>Zweck:</strong> ${reservation.reason}</td></tr>
          </table>
          <p style="margin:16px 0 0;color:#6b7280;font-size:13px;">
            Bitte bedenke, das Fahrzeug frühzeitig zu reservieren.
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

async function processReminders() {
  try {
    // Finde alle Reminders die now <= reminder_at_utc und noch nicht versendet
    const reminders = await db.queryMany(`
      SELECT r.id, r.user_id, r.vehicle_id, r.date, r.date_to, r.time_from, r.time_to, r.reason,
             u.name as user_name, u.email as user_email,
             v.name as vehicle_name, v.license_plate
      FROM reservations r
      JOIN users u ON r.user_id = u.id
      JOIN vehicles v ON r.vehicle_id = v.id
      WHERE r.reminder_status = 'pending'
        AND r.reminder_at_utc IS NOT NULL
        AND r.status = 'reserved'
        AND datetime(r.reminder_at_utc) <= datetime('now')
      ORDER BY r.reminder_at_utc ASC
      LIMIT 100
    `, []);

    if (reminders.length === 0) {
      return;
    }

    console.log(`[reminder-worker] Verarbeite ${reminders.length} fällige Reminders...`);

    for (const reminder of reminders) {
      try {
        // Atomare Update: Setze reminder_status = 'sending' und reminder_sent_at = NOW()
        // (Verhindert double-sends bei mehreren Worker-Instanzen)
        const { lastInsertId } = await db.execute(
          `UPDATE reservations 
           SET reminder_status = 'sending', reminder_sent_at = datetime('now')
           WHERE id = ? AND reminder_status = 'pending'`,
          [reminder.id]
        );

        // Versende Email
        await sendMail({
          to: reminder.user_email,
          subject: `FaBu – Fahrt am ${reminder.date} ${reminder.time_from} Uhr`,
          html: reminderEmailHtml(reminder),
        });

        // Finalise: reminder_status = 'sent'
        await db.execute(
          "UPDATE reservations SET reminder_status = 'sent' WHERE id = ?",
          [reminder.id]
        );

        console.log(`[reminder-worker] ✓ Reminder versendet für Reservation #${reminder.id}`);
      } catch (err) {
        console.error(`[reminder-worker] ✗ Fehler bei Reminder #${reminder.id}:`, err.message);

        // Resetze auf 'pending' bei Fehler (retry nächste Runde)
        await db.execute(
          "UPDATE reservations SET reminder_status = 'pending', reminder_sent_at = NULL WHERE id = ?",
          [reminder.id]
        ).catch(() => {}); // Ignore errors on cleanup
      }
    }
  } catch (err) {
    console.error('[reminder-worker] Fehler beim Abrufen von Reminders:', err.message);
  }
}

async function start() {
  if (process.env.NODE_ENV !== 'production') {
    console.log('[reminder-worker] DEV MODE – Worker nicht aktiv');
    return;
  }

  console.log('[reminder-worker] Gestartet. Pollt jede Minute nach fälligen Reminders...');

  // Initial run
  await processReminders();

  // Poll loop
  setInterval(processReminders, POLL_INTERVAL_MS);
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('[reminder-worker] Fahre herunter...');
  process.exit(0);
});

start().catch((err) => {
  console.error('[reminder-worker] Kritischer Fehler:', err);
  process.exit(1);
});
