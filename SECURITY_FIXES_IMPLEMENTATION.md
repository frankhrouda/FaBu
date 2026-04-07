# FaBu Security Fixes - Implementation Guide

## Status: 5/7 Critical Fixes Completed ✅

Already implemented and committed:
- ✅ **Session timeout**: 20 minutes (commit 49ebcb1)
- ✅ **CORS hardening**: Environment-aware configuration (commit 5523839)
- ✅ **HTTPS enforcement**: x-forwarded-proto redirect (commit 5523839)
- ✅ **Security headers**: CSP + HSTS via Helmet (commit 5523839)

## Remaining: 2 Critical + 1 Important Fixes

---

## **Fix 1: Strong Password Validation** (CRITICAL)
**Impact**: Prevents weak password attacks  
**Backward compatible**: YES (old passwords still work)

### Implementation

**Step 1: Add validation function in** `backend/src/routes/auth.js` (after line 107):

```javascript
/**
 * Validate password strength for NEW or CHANGED passwords ONLY.
 * Existing passwords (even weak ones) continue to work for backward compatibility.
 * @returns {string|null} Error message if invalid, null if valid
 */
function validatePasswordStrength(password) {
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
```

**Step 2: Replace old validation in 3 places:**

**Location A: register endpoint (around line 160)**
```javascript
// OLD:
if (password.length < 6) {
  return res.status(400).json({ error: 'Passwort muss mindestens 6 Zeichen haben' });
}

// NEW:
const passwordError = validatePasswordStrength(password);
if (passwordError) {
  return res.status(400).json({ error: passwordError });
}
```

**Location B: register-with-invite endpoint (around line 265)**
```javascript
// OLD:
if (password.length < 6) {
  return res.status(400).json({ error: 'Passwort muss mindestens 6 Zeichen haben' });
}

// NEW:
const passwordError = validatePasswordStrength(password);
if (passwordError) {
  return res.status(400).json({ error: passwordError });
}
```

**Location C: reset-password endpoint (around line 640)**
```javascript
// OLD:
if (String(password).length < 6) {
  return res.status(400).json({ error: 'Passwort muss mindestens 6 Zeichen haben' });
}

// NEW:
const passwordError = validatePasswordStrength(password);
if (passwordError) {
  return res.status(400).json({ error: passwordError });
}
```

---

## **Fix 2: Account Enumeration Prevention** (CRITICAL)
**Impact**: Prevents hackers from discovering registered email addresses  
**Backward compatible**: YES (generic error messages)

### Implementation

**Location A: register endpoint (around line 163)**
```javascript
// OLD:
const existing = await db.queryOne('SELECT id FROM users WHERE email = ?', [email]);
if (existing) return res.status(409).json({ error: 'E-Mail bereits registriert' });

// NEW:
const existing = await db.queryOne('SELECT id FROM users WHERE email = ?', [email]);
if (existing) {
  // Prevent account enumeration: return generic message
  return res.status(409).json({ error: 'Diese E-Mail-Adresse kann nicht registriert werden' });
}
```

**Location B: register-with-invite endpoint (around line 273)**
```javascript
// OLD:
const existing = await db.queryOne('SELECT id FROM users WHERE email = ?', [email]);
if (existing) return res.status(409).json({ error: 'E-Mail bereits registriert' });

// NEW: 
const existing = await db.queryOne('SELECT id FROM users WHERE email = ?', [email]);
if (existing) {
  // Prevent account enumeration: return generic message
  return res.status(409).json({ error: 'Diese E-Mail-Adresse kann nicht registriert werden' });
}
```

**Note**: forgot-password endpoint already has generic message ✅

---

## **Fix 3: JWT in httpOnly Cookies** (IMPORTANT - XSS Protection)
**Impact**: Protects JWT tokens from XSS attacks  
**Backward compatible**: PARTIAL (mobile apps can still read from JSON response)

### Implementation

**Step 1: Add cookie setter in** `backend/src/routes/auth.js` (after line 107):

```javascript
/**
 * Set JWT token in secure httpOnly cookie.
 * Prevents JavaScript from accessing token (XSS protection).
 * Browser automatically sends cookie with each request.
 */
function setAuthCookie(res, token) {
  res.cookie('fabu_auth', token, {
    httpOnly: true,                                 // Prevents JS access
    secure: process.env.NODE_ENV === 'production', // HTTPS only in prod
    sameSite: 'strict',                            // CSRF protection  
    maxAge: 20 * 60 * 1000,                        // 20 minutes (matches JWT expiry)
    path: '/',
  });
}
```

**Step 2: Import express-session in** `backend/src/app.js` (already done via helmet/express)

**Step 3: Call setAuthCookie in 4 token endpoints:**

- **register** (after email send, before `res.status(201).json...`):
  ```javascript
  setAuthCookie(res, token);
  ```

- **register-with-invite** (after email send):
  ```javascript
  setAuthCookie(res, token);
  ```

- **login** (after token creation):
  ```javascript
  setAuthCookie(res, token);
  ```

- **switch-tenant** (after token creation):
  ```javascript
  setAuthCookie(res, token);
  ```

**Step 4: Update** `backend/src/middleware/auth.js` **to read from cookie OR header**:

```javascript
export async function authenticate(req, res, next) {
  // Try cookie first (web), then header (mobile/legacy)
  const tokenFromCookie = req.cookies?.fabu_auth;
  const tokenFromHeader = req.headers.authorization?.split(' ')[1];
  const token = tokenFromCookie || tokenFromHeader;

  if (!token) return res.status(401).json({ error: 'Nicht autorisiert' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    // ... rest of function
  } catch {
    res.status(401).json({ error: 'Token ungültig oder abgelaufen' });
  }
}
```

**Step 5: Update** `frontend/src/api/client.js` **to use credentials:**

```javascript
async function request(path, options = {}) {
  // Remove localStorage JWT usage - browser sends cookie automatically
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: 'include',  // Include cookies in requests
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
  });

  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
```

**Step 6: Remove localStorage JWT from** `frontend/src/context/AuthContext.jsx`:
```javascript
// Remove:
// localStorage.setItem('fabu_token', token);
// localStorage.removeItem('fabu_token');
```

---

## Testing Checklist

After implementing all fixes:

- [ ] **Password validation**: Try register with weak password (< 12 chars, no special char) → Should fail
- [ ] **Backward compatibility**: Old user with 6-char password can still login → Should work
- [ ] **Account enumeration**: Try registering with existing email → Should NOT reveal if account exists
- [ ] **HTTPS**: Access http://VPS_IP → Should redirect to HTTPS
- [ ] **httpOnly cookie**: 
  - Check browser DevTools > Application > Cookies → Should see `fabu_auth` with httpOnly flag
  - Try `console.log(document.cookie)` → Should NOT show fabu_auth token
  - Check network request → Cookie should be sent in request headers

---

## Deployment

After fixing all 3 issues:

```bash
# Test locally
npm run dev  # Frontend
npm run dev  # Backend (separate terminal)

# Commit
git add backend/src/routes/auth.js backend/src/middleware/auth.js frontend/src/api/client.js frontend/src/context/AuthContext.jsx
git commit -m "security: strong passwords + account enumeration prevention + httpOnly cookies

- Add validatePasswordStrength(): 12 chars + uppercase + lowercase + digit + special char
- Generic error for account enumeration (register/register-with-invite)
- JWT now in secure httpOnly cookie (XSS protection)
- Frontend uses credentials: include for automatic cookie sending
- Old weak passwords still accepted (backward compatible)"

# Deploy
./deploy-prod.sh
```

---

## Summary of Security Improvements

| Fix | Before | After | Impact |
|-----|--------|-------|--------|
| **Session timeout** | 7 days (unacceptable) | 20 minutes | High - Forces re-auth |
| **Password strength** | 6 chars, no rules | 12 chars + complexity | High - Prevents brute force |
| **CORS** | Localhost in prod (!) | Environment-aware | Critical - Prevents XSS/CSRF |
| **HTTPS** | Possible HTTP transmission | Enforced HTTPS redirect | Critical - Prevents MitM |
| **Account enumeration** | Email exists leak | Generic messages | Medium - Privacy protection |
| **JWT storage** | LocalStorage (XSS risk) | httpOnly cookie | High - Prevents XSS token theft |
| **Security headers** | Basic Helmet | CSP + HSTS | Medium - Defense in depth |

---

## Questions?

Review the CRITICAL_SECURITY_FIXES.md document for more details on each vulnerability.

