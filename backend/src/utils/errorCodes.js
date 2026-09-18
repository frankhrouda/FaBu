/**
 * FaBu Error Code System
 * 
 * Alle Fehler erhalten eindeutige Codes mit Format: FBE[XXXXX]
 * FBE = FaBu Backend Error
 * 
 * Ranges:
 * 10000-19999 = Database Fehler
 * 20000-29999 = Authentication Fehler
 * 30000-39999 = Validation Fehler
 * 40000-49999 = Authorization Fehler
 * 50000-59999 = Business Logic Fehler
 * 60000-69999 = External Service Fehler (Mail, etc)
 * 70000-79999 = Internal Server Fehler
 */

export const ERROR_CODES = {
  // Database errors (10000-19999)
  DB_NOT_INITIALIZED: 'FBE10001',
  DB_CONNECTION_FAILED: 'FBE10002',
  DB_QUERY_FAILED: 'FBE10003',
  DB_TIMEOUT: 'FBE10004',
  DB_SCHEMA_MISMATCH: 'FBE10005',
  
  // Auth errors (20000-29999)
  AUTH_INVALID_CREDENTIALS: 'FBE20001',
  AUTH_TOKEN_EXPIRED: 'FBE20002',
  AUTH_TOKEN_INVALID: 'FBE20003',
  AUTH_MISSING_TOKEN: 'FBE20004',
  AUTH_INSUFFICIENT_PERMISSIONS: 'FBE20005',
  
  // Validation errors (30000-39999)
  VALIDATION_FAILED: 'FBE30001',
  VALIDATION_INVALID_EMAIL: 'FBE30002',
  VALIDATION_PASSWORD_WEAK: 'FBE30003',
  VALIDATION_MISSING_FIELD: 'FBE30004',
  
  // Authorization errors (40000-49999)
  AUTHZ_FORBIDDEN: 'FBE40001',
  AUTHZ_RESOURCE_NOT_FOUND: 'FBE40002',
  AUTHZ_TENANT_NOT_FOUND: 'FBE40003',
  
  // Business logic errors (50000-59999)
  BUSINESS_INVALID_STATE: 'FBE50001',
  BUSINESS_DUPLICATE_ENTRY: 'FBE50002',
  BUSINESS_RESOURCE_NOT_FOUND: 'FBE50003',
  BUSINESS_OPERATION_NOT_ALLOWED: 'FBE50004',
  
  // External service errors (60000-69999)
  MAIL_SEND_FAILED: 'FBE60001',
  EXTERNAL_API_FAILED: 'FBE60002',
  
  // Internal server errors (70000-79999)
  INTERNAL_SERVER_ERROR: 'FBE70001',
  INTERNAL_UNHANDLED_EXCEPTION: 'FBE70002',
};

// Reverse mapping für Code -> Message
const ERROR_MESSAGES = {
  FBE10001: 'Datenbankinitialisierung fehlgeschlagen. Bitte Systemadministrator kontaktieren.',
  FBE10002: 'Datenbankverbindung fehlgeschlagen. Der Datenbankserver antwortet nicht.',
  FBE10003: 'Datenbankoperation fehlgeschlagen.',
  FBE10004: 'Datenbankoperation hat das Zeitlimit überschritten.',
  FBE10005: 'Datenbankschema stimmt nicht überein.',
  
  FBE20001: 'Anmeldedaten ungültig.',
  FBE20002: 'Sitzung abgelaufen. Bitte melden Sie sich erneut an.',
  FBE20003: 'Authentifizierungstoken ungültig.',
  FBE20004: 'Authentifizierungstoken erforderlich.',
  FBE20005: 'Unzureichende Berechtigungen.',
  
  FBE30001: 'Validierungsfehler in den übermittelten Daten.',
  FBE30002: 'E-Mail-Format ungültig.',
  FBE30003: 'Passwort erfüllt nicht die Sicherheitsanforderungen.',
  FBE30004: 'Erforderliches Feld fehlt.',
  
  FBE40001: 'Zugriff verweigert.',
  FBE40002: 'Ressource nicht gefunden.',
  FBE40003: 'Mandant nicht gefunden.',
  
  FBE50001: 'Operation in diesem Zustand nicht erlaubt.',
  FBE50002: 'Diese Einheit existiert bereits.',
  FBE50003: 'Ressource nicht gefunden.',
  FBE50004: 'Diese Operation ist nicht erlaubt.',
  
  FBE60001: 'E-Mail konnte nicht versendet werden.',
  FBE60002: 'Externe API antwortet nicht.',
  
  FBE70001: 'Interner Serverfehler. Bitte später erneut versuchen.',
  FBE70002: 'Unerwarteter Serverfehler. Das Support-Team wurde benachrichtigt.',
};

/**
 * Erstellt standardisierte Error-Response mit eindeutigem Code
 * @param {string} code - Error-Code aus ERROR_CODES
 * @param {object} options - { message, details, statusCode, originalError }
 */
export function createErrorResponse(code, options = {}) {
  const {
    message = ERROR_MESSAGES[code] || 'Unbekannter Fehler',
    details = null,
    statusCode = 500,
    originalError = null,
  } = options;

  const errorId = generateErrorId();

  const response = {
    error: message,
    code,
    errorId,
    timestamp: new Date().toISOString(),
  };

  if (details) {
    response.details = details;
  }

  // In production: Log für Support
  if (process.env.NODE_ENV === 'production') {
    console.error(`[${code}] Error ID: ${errorId}`, {
      message,
      details,
      originalError: originalError?.message,
      stack: originalError?.stack,
    });
  }

  return { statusCode, body: response };
}

/**
 * Generiert eindeutige Error-ID (Timestamp + Random)
 * Format: ERR-20260422-1234567890ABCDEF
 */
function generateErrorId() {
  const date = new Date();
  const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
  const timestamp = date.getTime();
  const random = Math.random().toString(36).substring(2, 10).toUpperCase();
  return `ERR-${dateStr}-${timestamp}${random}`;
}

/**
 * Express Error Handler Middleware
 */
export function errorHandler(err, req, res, next) {
  console.error('Unbehandelte Exception:', err);

  // Database connection errors
  if (err.code === 'ECONNREFUSED' || err.message?.includes('connect')) {
    const { statusCode, body } = createErrorResponse(ERROR_CODES.DB_CONNECTION_FAILED, {
      originalError: err,
      statusCode: 502,
    });
    return res.status(statusCode).json(body);
  }

  // Database query errors
  if (err.code?.startsWith('SQLSTATE') || err.code === '08006' || err.message?.includes('query')) {
    const { statusCode, body } = createErrorResponse(ERROR_CODES.DB_QUERY_FAILED, {
      originalError: err,
      statusCode: 503,
    });
    return res.status(statusCode).json(body);
  }

  // Default: Internal server error
  const { statusCode, body } = createErrorResponse(ERROR_CODES.INTERNAL_UNHANDLED_EXCEPTION, {
    originalError: err,
  });
  res.status(statusCode).json(body);
}
