# FaBu Security - Critical Fixes Required

## 🔴 CRITICAL: SQL Injection Risk (users.js - km-summary)

**File:** `backend/src/routes/users.js` - Lines 170-230  
**Risk:** Dynamic SQL construction with template literals

### Current (Dangerous) Code:
```javascript
const hasTenantFilter = Number.isInteger(Number(req.tenantId)) && Number(req.tenantId) > 0;
const tenantFilterSql = hasTenantFilter ? 'AND v.tenant_id = ?' : '';

const byVehicle = await db.queryMany(`
  SELECT ... WHERE r.user_id = ?
    ${tenantFilterSql}  // ❌ Template literal SQL
    AND r.status = 'completed' ...
`, byVehicleParams);
```

### Fixed Code:
```javascript
// Use separate queries instead of template literals
if (req.tenantId && Number.isInteger(Number(req.tenantId)) && Number(req.tenantId) > 0) {
  const byVehicle = await db.queryMany(`
    SELECT
      v.id as vehicle_id,
      v.name as vehicle_name,
      v.license_plate,
      COALESCE(v.price_per_km, 0) as price_per_km,
      v.flat_fee as flat_fee,
      COUNT(r.id) as trips,
      COALESCE(SUM(r.km_driven), 0) as total_km
    FROM reservations r
    JOIN vehicles v ON v.id = r.vehicle_id
    WHERE r.user_id = ?
      AND v.tenant_id = ?
      AND r.status = 'completed'
      AND r.km_driven IS NOT NULL
      AND r.date >= ?
      AND r.date <= ?
    GROUP BY v.id, v.name, v.license_plate, v.price_per_km, v.flat_fee
    ORDER BY total_km DESC, trips DESC, v.name ASC
  `, [userId, Number(req.tenantId), from, to]);
} else {
  const byVehicle = await db.queryMany(`
    SELECT
      v.id as vehicle_id,
      v.name as vehicle_name,
      v.license_plate,
      COALESCE(v.price_per_km, 0) as price_per_km,
      v.flat_fee as flat_fee,
      COUNT(r.id) as trips,
      COALESCE(SUM(r.km_driven), 0) as total_km
    FROM reservations r
    JOIN vehicles v ON v.id = r.vehicle_id
    WHERE r.user_id = ?
      AND r.status = 'completed'
      AND r.km_driven IS NOT NULL
      AND r.date >= ?
      AND r.date <= ?
    GROUP BY v.id, v.name, v.license_plate, v.price_per_km, v.flat_fee
    ORDER BY total_km DESC, trips DESC, v.name ASC
  `, [userId, from, to]);
}
```

---

## 🔴 CRITICAL: Weak Password Requirements

**File:** `backend/src/routes/auth.js` - Line 154  
**Current Risk:** Passwords only 6 characters, no complexity requirements

### Current Code:
```javascript
if (password.length < 6) {
  return res.status(400).json({ error: 'Passwort muss mindestens 6 Zeichen haben' });
}
```

### Fixed Code:
```javascript
function validatePasswordStrength(password) {
  const errors = [];
  if (!password || password.length < 12) {
    errors.push('Mindestens 12 Zeichen erforderlich');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Mindestens ein Großbuchstabe erforderlich');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Mindestens ein Kleinbuchstabe erforderlich');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Mindestens eine Zahl erforderlich');
  }
  if (!/[!@#$%^&*\-_=+]/.test(password)) {
    errors.push('Mindestens ein Sonderzeichen erforderlich');
  }
  return errors;
}

// In register route:
const passwordErrors = validatePasswordStrength(password);
if (passwordErrors.length > 0) {
  return res.status(400).json({ error: passwordErrors[0] });
}
```

---

## 🔴 CRITICAL: CORS + HTTPS Enforcement Missing

**File:** `backend/src/app.js` - Lines 25 & 23  
**Risk:** Hardcoded dev origins, no HTTPS enforcement

### Current Code:
```javascript
app.use(cors({ 
  origin: [
    'http://localhost:5173',
    'http://localhost:4173',
    'https://fabu-online.de',
    'https://www.fabu-online.de'
  ] 
}));
```

### Fixed Code:
```javascript
// Add to .env files
// .env.development
CORS_ORIGINS=http://localhost:5173,http://localhost:4173

// .env.production
CORS_ORIGINS=https://fabu-online.de,https://www.fabu-online.de
NODE_ENV=production

// In app.js
const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',').filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS not allowed'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 3600,
};

app.use(cors(corsOptions));

// Add HTTPS enforcement
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    const xForwardedProto = req.header('X-Forwarded-Proto');
    if (xForwardedProto !== 'https') {
      return res.redirect(301, `https://${req.header('Host')}${req.url}`);
    }
    next();
  });
}
```

---

## 🔴 CRITICAL: Information Disclosure - Account Enumeration

**File:** `backend/src/routes/auth.js` - Line 154  
**Risk:** Tells attackers if email is already registered

### Current Code:
```javascript
if (existing) return res.status(409).json({ error: 'E-Mail bereits registriert' });
```

### Fixed Code:
```javascript
// In register endpoint - don't reveal if email exists
if (existing) {
  // Silently fail or pretend to register
  return res.status(201).json({ 
    message: 'Ein Bestätigungslink wurde an deine E-Mail gesendet',
    token: null 
  });
}

// In login endpoint - use generic message
const row = await db.queryOne(
  'SELECT * FROM users WHERE LOWER(email) = ?', 
  [normalizedEmail]
);

if (!row || !await bcrypt.compare(password, row.password)) {
  // Generic error for both cases
  return res.status(401).json({ error: 'E-Mail oder Passwort ist nicht korrekt' });
}
```

---

## 🔴 CRITICAL: Password Reset Tokens Stored in Plaintext

**File:** `backend/src/routes/auth.js` - Lines 494-530  
**Risk:** Database breach exposes all active reset tokens

### Current Code:
```javascript
const token = crypto.randomBytes(32).toString('hex');
await db.execute(
  'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
  [user.id, token, expiresAt]  // ❌ Plaintext in DB!
);

// In reset endpoint:
const tokenRow = await db.queryOne(
  'SELECT * FROM password_reset_tokens WHERE token = ? AND used_at IS NULL',
  [String(token).trim()]
);
```

### Fixed Code:
```javascript
import crypto from 'crypto';

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// In forgot-password endpoint:
const tokenPlaintext = crypto.randomBytes(32).toString('hex');
const tokenHash = hashToken(tokenPlaintext);

await db.execute(
  'UPDATE password_reset_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL',
  [new Date().toISOString(), user.id]
);

await db.execute(
  'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
  [user.id, tokenHash, expiresAt]
);

const resetLink = `${APP_FRONTEND_URL}/reset-password?token=${tokenPlaintext}`;
sendMail({ to: user.email, subject, html: passwordResetHtml(user.name, resetLink) });

// In reset-password endpoint:
const incomingToken = req.body.token;
if (!incomingToken) {
  return res.status(400).json({ error: 'Token erforderlich' });
}

const incomingHash = hashToken(incomingToken);
const tokenRow = await db.queryOne(
  'SELECT * FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL',
  [incomingHash]
);

if (!tokenRow || new Date(tokenRow.expires_at) <= new Date()) {
  return res.status(400).json({ error: 'Link ist ungültig oder abgelaufen' });
}

const hash = await bcrypt.hash(String(password), 10);
await db.execute('UPDATE users SET password = ? WHERE id = ?', [hash, tokenRow.user_id]);
await db.execute(
  'UPDATE password_reset_tokens SET used_at = ? WHERE id = ?',
  [new Date().toISOString(), tokenRow.id]
);
```

**Database Migration:**
```sql
-- Add new column
ALTER TABLE password_reset_tokens ADD COLUMN token_hash TEXT UNIQUE;

-- Hash existing tokens and update
UPDATE password_reset_tokens 
SET token_hash = hex(sha256(token))
WHERE used_at IS NULL;

-- Migrate data...
-- Then drop old column (after migration complete)
ALTER TABLE password_reset_tokens DROP COLUMN token;
```

---

## 🔴 CRITICAL: JWT in localStorage (XSS Risk)

**File:** `frontend/src/api/client.js`, `frontend/src/context/AuthContext.jsx`  
**Risk:** Any XSS vulnerability exposes token

### Current Code:
```javascript
const token = localStorage.getItem('fabu_token');
const res = await fetch(`${BASE}${path}`, {
  headers: { Authorization: `Bearer ${token}` }
});
```

### Fixed Code (Backend):
```javascript
// In app.js - add cookie middleware
import cookieParser from 'cookie-parser';
app.use(cookieParser());

// In auth endpoints (register, login, switch-tenant):
res.cookie('fabu_token', token, {
  httpOnly: true,        // 🔒 Not accessible to JavaScript
  secure: true,          // 🔒 Only sent over HTTPS
  sameSite: 'Strict',    // 🔒 CSRF protection
  maxAge: 20 * 60 * 1000 // 20 minutes
});

res.status(201).json({ 
  token: undefined,  // Don't return token
  user,
  available_tenants: getAccessibleTenants(user, memberships, activeTenantId) 
});

// Logout endpoint
router.post('/logout', authenticate, (req, res) => {
  res.clearCookie('fabu_token', {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict'
  });
  res.json({ message: 'Logged out' });
});
```

### Fixed Code (Frontend):
```javascript
// frontend/src/api/client.js
async function request(path, options = {}) {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: 'include',  // 🔒 Include httpOnly cookies
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      // ✅ No Authorization header - token is in cookie
      ...options.headers,
    },
  });

  if (res.status === 401) {
    // Token expired or not present - redirect to login
    window.location.href = '/login';
    return null;
  }

  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (path) => request(path, { method: 'DELETE' }),
  uploadVehicleImage: (vehicleId, file) => {
    const body = new FormData();
    body.append('image', file);
    return request(`/vehicles/${vehicleId}/image`, { method: 'POST', body });
  },
  logout: () => request('/auth/logout', { method: 'POST' }),
};

// Update AuthContext to remove localStorage
// Remove: localStorage.setItem('fabu_token', token)
// Remove: localStorage.getItem('fabu_token')
// Remove: localStorage.removeItem('fabu_token')
// Tokens are now in httpOnly cookies - no need for storage
```

**package.json update:**
```bash
npm install cookie-parser
```

---

## Environment Configuration

### .env.development
```
NODE_ENV=development
PORT=3001
JWT_SECRET=dev-secret-change-in-production-12345
DB_CLIENT=sqlite
CORS_ORIGINS=http://localhost:5173,http://localhost:4173
APP_FRONTEND_URL=http://localhost:5173
ALLOW_OPEN_REGISTRATION=true
RESEND_API_KEY=
```

### .env.production
```
NODE_ENV=production
PORT=3001
JWT_SECRET=<generate-with-crypto.randomBytes(32).toString('hex')>
DB_CLIENT=postgres
DATABASE_URL=postgresql://user:pass@host/dbname
CORS_ORIGINS=https://fabu-online.de,https://www.fabu-online.de
APP_FRONTEND_URL=https://fabu-online.de
ALLOW_OPEN_REGISTRATION=false
RESEND_API_KEY=<from-resend-dashboard>
MAIL_FROM=noreply@fabu-online.de
```

---

## Testing These Fixes

```bash
# Test HTTPS enforcement
curl -i http://localhost:3001/api/auth/login

# Test CORS rejection
curl -H "Origin: http://evil.com" -H "Access-Control-Request-Method: POST" http://localhost:3001/api/auth/login

# Test password strength
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@test.com","password":"123456"}'
# Should be rejected

# Test SQLi fix (ensure no template literals in queries)
grep -r "\${.*sql" backend/src/

# Test token hash on password reset
# Generate reset request, check DB - token should be hashed SHA256
```

---

## Deployment Checklist Before Going Live

- [ ] All 5 critical vulnerabilities fixed and tested
- [ ] JWT tokens moved to httpOnly secure cookies
- [ ] HTTPS enforced at application level
- [ ] Environment variables configured per environment
- [ ] No localhost origins in production CORS
- [ ] Database backups encrypted
- [ ] Rate limiting verified on all auth endpoints
- [ ] Security headers verified with Helmet
- [ ] Password requirements enforced (12+ chars, complexity)
- [ ] SQL Injection review completed (no template literals)
- [ ] File upload magic number validation added
- [ ] Anonymous error messages verified (no stack traces to user)
- [ ] Database audit logging added (optional but recommended)
- [ ] Penetration testing completed

