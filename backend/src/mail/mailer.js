/**
 * Mailer – Resend-Adapter für FaBu.
 *
 * Benötigte Umgebungsvariablen:
 *   RESEND_API_KEY   – API-Key aus dem Resend-Dashboard
 *   MAIL_FROM        – Absenderadresse, z. B. noreply@mail.fabu-online.de
 *                      (Muss auf einer in Resend verifizierten Domain liegen)
 *
 * Wenn RESEND_API_KEY nicht gesetzt ist, wird die Mail nur geloggt (kein Fehler).
 * So funktioniert das Backend auch lokal ohne Resend-Konfiguration.
 */

import { Resend } from 'resend';

const MAIL_FROM = process.env.MAIL_FROM || 'noreply@fabu-online.de';

let _resend = null;

function getClient() {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

/**
 * Sendet eine transaktionale E-Mail via Resend.
 *
 * @param {{ to: string, subject: string, html: string }} options
 * @returns {Promise<string|null>} provider message ID oder null (bei deaktiviertem Versand)
 */
export async function sendMail({ to, subject, html }) {
  // Nur in Production versenden – in Entwicklung/Testing loggen wir nur
  if (process.env.NODE_ENV !== 'production') {
    console.log('[mailer] DEV MODE – Mail nicht versendet:', { to, subject });
    return null;
  }

  const client = getClient();

  if (!client) {
    console.warn('[mailer] RESEND_API_KEY nicht gesetzt – Mail wird nicht versendet:', { to, subject });
    return null;
  }

  const { data, error } = await client.emails.send({
    from: MAIL_FROM,
    to,
    subject,
    html,
  });

  if (error) {
    throw new Error(`[mailer] Versand fehlgeschlagen: ${error.message}`);
  }

  return data?.id ?? null;
}
