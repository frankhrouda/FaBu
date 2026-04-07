/**
 * Password strength validation.
 * For NEW or CHANGED passwords only.
 * Existing passwords (even weak ones) can still login (backward compatibility).
 */
export function validatePasswordStrength(password) {
  if (!password || password.length < 12) {
    return 'Passwort muss mindestens 12 Zeichen lang sein';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Passwort muss mindestens einen Großbuchstaben enthalten';
  }
  if (!/[a-z]/.test(password)) {
    return 'Passwort muss mindestens einen Kleinbuchstaben enthalten';
  }
  if (!/[0-9]/.test(password)) {
    return 'Passwort muss mindestens eine Zahl enthalten';
  }
  if (!/[!@#$%^&*\-_=+]/.test(password)) {
    return 'Passwort muss mindestens ein Sonderzeichen enthalten (!@#$%^&*-_=+)';
  }
  return null;
}
