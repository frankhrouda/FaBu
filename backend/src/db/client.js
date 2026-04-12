/**
 * DB abstraction layer.
 * Supports SQLite (via better-sqlite3) and PostgreSQL (via pg).
 * Set DB_CLIENT=postgres in .env to use Postgres; default is sqlite.
 *
 * Interface:
 *   queryOne(text, params)   -> single row or null
 *   queryMany(text, params)  -> array of rows
 *   execute(text, params)    -> { lastInsertId } (insert/update/delete)
 */

import 'dotenv/config';
import Database from 'better-sqlite3';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const IS_POSTGRES = process.env.DB_CLIENT === 'postgres';

// ─── Postgres type normalization ─────────────────────────────────────────────
// By default the pg driver converts DATE -> JS Date object (serializes to ISO string)
// and BOOLEAN -> true/false. We override the parsers so the output matches SQLite's
// behaviour: DATE stays as 'YYYY-MM-DD' string, TIME as 'HH:MM:SS' string,
// BOOLEAN as integer 1/0. This keeps all frontend comparisons and formatDate()
// working without any changes.
pg.types.setTypeParser(16,   (v) => (v === 't' ? 1 : 0));  // BOOLEAN     → 0/1
pg.types.setTypeParser(1082, (v) => v);                      // DATE        → 'YYYY-MM-DD'
pg.types.setTypeParser(1083, (v) => v);                      // TIME        → 'HH:MM:SS'
pg.types.setTypeParser(1266, (v) => v);                      // TIMETZ      → string
pg.types.setTypeParser(1114, (v) => v);                      // TIMESTAMP   → string
pg.types.setTypeParser(1184, (v) => v);                      // TIMESTAMPTZ → string

// ─── Postgres ────────────────────────────────────────────────────────────────

let pgPool = null;

function getPool() {
  if (!pgPool) {
    pgPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pgPool;
}

// Convert ? placeholders to $1, $2, ... for Postgres
function toPgParams(text) {
  let i = 0;
  return text.replace(/\?/g, () => `$${++i}`);
}

async function pgQueryOne(text, params = []) {
  const { rows } = await getPool().query(toPgParams(text), params);
  return rows[0] ?? null;
}

async function pgQueryMany(text, params = []) {
  const { rows } = await getPool().query(toPgParams(text), params);
  return rows;
}

async function pgExecute(text, params = []) {
  // For INSERT ... RETURNING id we extract lastInsertId automatically
  const returningText = /RETURNING\s+/i.test(text) ? text : text;
  const { rows } = await getPool().query(toPgParams(returningText), params);
  return { lastInsertId: rows[0]?.id ?? null, row: rows[0] ?? null };
}

// ─── SQLite ───────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data');
const DB_PATH = process.env.SQLITE_DB_PATH || path.join(DATA_DIR, 'fabu.db');

let sqliteDb = null;

function normalizeSqliteParams(params = []) {
  return params.map((value) => (typeof value === 'boolean' ? (value ? 1 : 0) : value));
}

function getSqlite() {
  if (!sqliteDb) {
    mkdirSync(DATA_DIR, { recursive: true });
    sqliteDb = new Database(DB_PATH);
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = ON');
  }
  return sqliteDb;
}

async function sqliteQueryOne(text, params = []) {
  return getSqlite().prepare(text).get(...normalizeSqliteParams(params)) ?? null;
}

async function sqliteQueryMany(text, params = []) {
  return getSqlite().prepare(text).all(...normalizeSqliteParams(params));
}

async function sqliteExecute(text, params = []) {
  const normalizedParams = normalizeSqliteParams(params);
  const hasReturning = /RETURNING\s+/i.test(text);
  if (hasReturning) {
    const row = getSqlite().prepare(text).get(...normalizedParams) ?? null;
    return { lastInsertId: row?.id ?? null, row };
  }
  const result = getSqlite().prepare(text).run(...normalizedParams);
  return { lastInsertId: result.lastInsertRowid, row: null };
}

// ─── Schema init ─────────────────────────────────────────────────────────────

const SQLITE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS vehicles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    license_plate TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'PKW',
    description TEXT DEFAULT '',
    image_path TEXT,
    price_per_km REAL NOT NULL DEFAULT 0,
    flat_fee REAL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    vehicle_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    date_to TEXT NOT NULL,
    time_from TEXT NOT NULL,
    time_to TEXT NOT NULL,
    reason TEXT NOT NULL,
    km_driven INTEGER,
    destination TEXT,
    vehicle_rating INTEGER,
    vehicle_rating_comment TEXT,
    vehicle_rated_at TEXT,
    status TEXT NOT NULL DEFAULT 'reserved',
    reminder_minutes_before INTEGER DEFAULT 60,
    reminder_at_utc TEXT,
    reminder_sent_at TEXT,
    reminder_status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
  );

  CREATE TABLE IF NOT EXISTS tenants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS tenant_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(tenant_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS invitation_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL,
    code TEXT NOT NULL UNIQUE,
    email TEXT,
    created_by INTEGER NOT NULL,
    used_by INTEGER,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    used_at DATETIME,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (used_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS tenant_admin_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    tenant_name TEXT NOT NULL,
    password_hash TEXT,
    message TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    tenant_id INTEGER,
    approved_user_id INTEGER,
    decided_by INTEGER,
    decided_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (approved_user_id) REFERENCES users(id),
    FOREIGN KEY (decided_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS waitlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    vehicle_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    date_to TEXT NOT NULL,
    time_from TEXT NOT NULL,
    time_to TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    offered_at TEXT,
    expires_at TEXT,
    reservation_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
    FOREIGN KEY (reservation_id) REFERENCES reservations(id)
  );

  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`;

const PG_SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS vehicles (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL,
    license_plate TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'PKW',
    description TEXT DEFAULT '',
    image_path TEXT,
    price_per_km DOUBLE PRECISION NOT NULL DEFAULT 0,
    flat_fee DOUBLE PRECISION,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
    date DATE NOT NULL,
    date_to DATE NOT NULL,
    time_from TIME NOT NULL,
    time_to TIME NOT NULL,
    reason TEXT NOT NULL,
    km_driven INTEGER,
    destination TEXT,
    vehicle_rating INTEGER,
    vehicle_rating_comment TEXT,
    vehicle_rated_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'reserved',
    reminder_minutes_before INTEGER DEFAULT 60,
    reminder_at_utc TIMESTAMPTZ,
    reminder_sent_at TIMESTAMPTZ,
    reminder_status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS tenants (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS tenant_members (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS invitation_codes (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code TEXT NOT NULL UNIQUE,
    email TEXT,
    created_by INTEGER NOT NULL REFERENCES users(id),
    used_by INTEGER REFERENCES users(id),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    used_at TIMESTAMPTZ
  );

  CREATE TABLE IF NOT EXISTS tenant_admin_requests (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    tenant_name TEXT NOT NULL,
    password_hash TEXT,
    message TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    tenant_id INTEGER REFERENCES tenants(id),
    approved_user_id INTEGER REFERENCES users(id),
    decided_by INTEGER REFERENCES users(id),
    decided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_res_vehicle_date ON reservations(vehicle_id, date);
  CREATE INDEX IF NOT EXISTS idx_res_user ON reservations(user_id);
  CREATE INDEX IF NOT EXISTS idx_tenant_members_tenant_user ON tenant_members(tenant_id, user_id);
  CREATE INDEX IF NOT EXISTS idx_invitation_codes_code ON invitation_codes(code);
  CREATE INDEX IF NOT EXISTS idx_tenant_admin_requests_status ON tenant_admin_requests(status);
  CREATE INDEX IF NOT EXISTS idx_tenant_admin_requests_email ON tenant_admin_requests(email);

  CREATE TABLE IF NOT EXISTS waitlist (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
    date DATE NOT NULL,
    date_to DATE NOT NULL,
    time_from TIME NOT NULL,
    time_to TIME NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    offered_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    reservation_id INTEGER REFERENCES reservations(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_waitlist_slot ON waitlist(vehicle_id, date, date_to, time_from, time_to, status);

  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
`;

async function ensurePgMigrations() {
  await getPool().query('ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS price_per_km DOUBLE PRECISION NOT NULL DEFAULT 0');
  await getPool().query('ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS flat_fee DOUBLE PRECISION');
  await getPool().query('ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS image_path TEXT');
  await getPool().query('ALTER TABLE reservations ADD COLUMN IF NOT EXISTS date_to DATE');
  await getPool().query('ALTER TABLE reservations ADD COLUMN IF NOT EXISTS vehicle_rating INTEGER');
  await getPool().query('ALTER TABLE reservations ADD COLUMN IF NOT EXISTS vehicle_rating_comment TEXT');
  await getPool().query('ALTER TABLE reservations ADD COLUMN IF NOT EXISTS vehicle_rated_at TIMESTAMPTZ');
  await getPool().query('ALTER TABLE reservations ADD COLUMN IF NOT EXISTS reminder_minutes_before INTEGER DEFAULT 60');
  await getPool().query('ALTER TABLE reservations ADD COLUMN IF NOT EXISTS reminder_at_utc TIMESTAMPTZ');
  await getPool().query('ALTER TABLE reservations ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ');
  await getPool().query('ALTER TABLE reservations ADD COLUMN IF NOT EXISTS reminder_status TEXT DEFAULT \'pending\'');
  await getPool().query('ALTER TABLE users ADD COLUMN IF NOT EXISTS super_admin BOOLEAN NOT NULL DEFAULT FALSE');
  await getPool().query('ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id)');
  await getPool().query('UPDATE reservations SET date_to = date WHERE date_to IS NULL');
  await getPool().query("UPDATE reservations SET vehicle_rating = 5, vehicle_rated_at = COALESCE(vehicle_rated_at, created_at, NOW()) WHERE status = 'completed' AND vehicle_rating IS NULL");

  const defaultTenantName = process.env.DEFAULT_TENANT_NAME || 'Default Tenant';
  const firstUser = await pgQueryOne('SELECT id, role FROM users ORDER BY id ASC LIMIT 1');
  if (!firstUser) return;

  const existingTenant = await pgQueryOne('SELECT id FROM tenants ORDER BY id ASC LIMIT 1');
  let tenantId = existingTenant?.id ?? null;

  if (!tenantId) {
    const created = await pgQueryOne(
      'INSERT INTO tenants (name, created_by) VALUES (?, ?) RETURNING id',
      [defaultTenantName, firstUser.id]
    );
    tenantId = created?.id;
  }

  await getPool().query(
    `INSERT INTO tenant_members (tenant_id, user_id, role)
     SELECT $1, u.id, CASE WHEN u.role = 'admin' THEN 'admin' ELSE 'user' END
     FROM users u
     WHERE NOT EXISTS (
       SELECT 1 FROM tenant_members tm WHERE tm.tenant_id = $1 AND tm.user_id = u.id
     )`,
    [tenantId]
  );

  await getPool().query('UPDATE vehicles SET tenant_id = $1 WHERE tenant_id IS NULL', [tenantId]);
  await getPool().query("UPDATE users SET super_admin = TRUE WHERE role = 'admin' AND id = $1", [firstUser.id]);

  await getPool().query('CREATE INDEX IF NOT EXISTS idx_vehicles_tenant_id ON vehicles(tenant_id)');

  // Legacy migration: remove global unique constraint on license_plate and enforce per-tenant uniqueness.
  await getPool().query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'vehicles_license_plate_key'
      ) THEN
        ALTER TABLE vehicles DROP CONSTRAINT vehicles_license_plate_key;
      END IF;
    END
    $$;
  `);

  await getPool().query(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_tenant_license_plate_unique ON vehicles(tenant_id, license_plate)'
  );
  await getPool().query(
    'CREATE INDEX IF NOT EXISTS idx_waitlist_slot ON waitlist(vehicle_id, date, date_to, time_from, time_to, status)'
  );
}

function ensureSqliteMigrations() {
  const vehicleColumns = getSqlite().prepare("PRAGMA table_info(vehicles)").all();
  const hasPricePerKm = vehicleColumns.some((col) => col.name === 'price_per_km');
  const hasFlatFee = vehicleColumns.some((col) => col.name === 'flat_fee');
  if (!hasPricePerKm) {
    getSqlite().exec('ALTER TABLE vehicles ADD COLUMN price_per_km REAL NOT NULL DEFAULT 0');
  }
  if (!hasFlatFee) {
    getSqlite().exec('ALTER TABLE vehicles ADD COLUMN flat_fee REAL');
  }
  const hasImagePath = vehicleColumns.some((col) => col.name === 'image_path');
  if (!hasImagePath) {
    getSqlite().exec('ALTER TABLE vehicles ADD COLUMN image_path TEXT');
  }

  const columns = getSqlite().prepare("PRAGMA table_info(reservations)").all();
  const hasDateTo = columns.some((col) => col.name === 'date_to');
  if (!hasDateTo) {
    getSqlite().exec('ALTER TABLE reservations ADD COLUMN date_to TEXT');
    getSqlite().exec('UPDATE reservations SET date_to = date WHERE date_to IS NULL');
  } else {
    getSqlite().exec('UPDATE reservations SET date_to = date WHERE date_to IS NULL');
  }

  const hasVehicleRating = columns.some((col) => col.name === 'vehicle_rating');
  if (!hasVehicleRating) {
    getSqlite().exec('ALTER TABLE reservations ADD COLUMN vehicle_rating INTEGER');
  }

  const hasVehicleRatingComment = columns.some((col) => col.name === 'vehicle_rating_comment');
  if (!hasVehicleRatingComment) {
    getSqlite().exec('ALTER TABLE reservations ADD COLUMN vehicle_rating_comment TEXT');
  }

  const hasVehicleRatedAt = columns.some((col) => col.name === 'vehicle_rated_at');
  if (!hasVehicleRatedAt) {
    getSqlite().exec('ALTER TABLE reservations ADD COLUMN vehicle_rated_at TEXT');
  }

  const hasReminderMinutesBefore = columns.some((col) => col.name === 'reminder_minutes_before');
  if (!hasReminderMinutesBefore) {
    getSqlite().exec('ALTER TABLE reservations ADD COLUMN reminder_minutes_before INTEGER DEFAULT 60');
  }

  const hasReminderAtUtc = columns.some((col) => col.name === 'reminder_at_utc');
  if (!hasReminderAtUtc) {
    getSqlite().exec('ALTER TABLE reservations ADD COLUMN reminder_at_utc TEXT');
  }

  const hasReminderSentAt = columns.some((col) => col.name === 'reminder_sent_at');
  if (!hasReminderSentAt) {
    getSqlite().exec('ALTER TABLE reservations ADD COLUMN reminder_sent_at TEXT');
  }

  const hasReminderStatus = columns.some((col) => col.name === 'reminder_status');
  if (!hasReminderStatus) {
    getSqlite().exec('ALTER TABLE reservations ADD COLUMN reminder_status TEXT DEFAULT \'pending\'');
  }

  getSqlite().exec("UPDATE reservations SET vehicle_rating = 5, vehicle_rated_at = COALESCE(vehicle_rated_at, created_at, CURRENT_TIMESTAMP) WHERE status = 'completed' AND vehicle_rating IS NULL");

  const userColumns = getSqlite().prepare("PRAGMA table_info(users)").all();
  const hasSuperAdmin = userColumns.some((col) => col.name === 'super_admin');
  if (!hasSuperAdmin) {
    getSqlite().exec('ALTER TABLE users ADD COLUMN super_admin INTEGER NOT NULL DEFAULT 0');
  }

  const vehicleColumnsAfter = getSqlite().prepare("PRAGMA table_info(vehicles)").all();
  const hasTenantId = vehicleColumnsAfter.some((col) => col.name === 'tenant_id');
  if (!hasTenantId) {
    getSqlite().exec('ALTER TABLE vehicles ADD COLUMN tenant_id INTEGER');
  }

  getSqlite().exec('CREATE INDEX IF NOT EXISTS idx_vehicles_tenant_id ON vehicles(tenant_id)');
  getSqlite().exec('CREATE INDEX IF NOT EXISTS idx_tenant_members_tenant_user ON tenant_members(tenant_id, user_id)');
  getSqlite().exec('CREATE INDEX IF NOT EXISTS idx_invitation_codes_code ON invitation_codes(code)');
  getSqlite().exec('CREATE INDEX IF NOT EXISTS idx_tenant_admin_requests_status ON tenant_admin_requests(status)');
  getSqlite().exec('CREATE INDEX IF NOT EXISTS idx_tenant_admin_requests_email ON tenant_admin_requests(email)');

  const firstUser = getSqlite().prepare('SELECT id, role FROM users ORDER BY id ASC LIMIT 1').get();
  if (!firstUser) return;

  const defaultTenantName = process.env.DEFAULT_TENANT_NAME || 'Default Tenant';
  const existingTenant = getSqlite().prepare('SELECT id FROM tenants ORDER BY id ASC LIMIT 1').get();
  let tenantId = existingTenant?.id;

  if (!tenantId) {
    const insertTenant = getSqlite().prepare('INSERT INTO tenants (name, created_by) VALUES (?, ?)');
    const result = insertTenant.run(defaultTenantName, firstUser.id);
    tenantId = Number(result.lastInsertRowid);
  }

  getSqlite().prepare(`
    INSERT OR IGNORE INTO tenant_members (tenant_id, user_id, role)
    SELECT ?, id, CASE WHEN role = 'admin' THEN 'admin' ELSE 'user' END
    FROM users
  `).run(tenantId);

  getSqlite().prepare('UPDATE vehicles SET tenant_id = ? WHERE tenant_id IS NULL').run(tenantId);
  getSqlite().prepare("UPDATE users SET super_admin = 1 WHERE role = 'admin' AND id = ?").run(firstUser.id);

  // Legacy migration: remove global UNIQUE(license_plate) and replace with UNIQUE(tenant_id, license_plate).
  const vehiclesTableSql = getSqlite().prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'vehicles'"
  ).get()?.sql || '';
  const hasLegacyGlobalUniquePlate = /license_plate\s+TEXT\s+UNIQUE/i.test(vehiclesTableSql);

  if (hasLegacyGlobalUniquePlate) {
    getSqlite().exec('PRAGMA foreign_keys = OFF');
    getSqlite().exec('BEGIN TRANSACTION');
    try {
      getSqlite().exec(`
        CREATE TABLE vehicles_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          license_plate TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'PKW',
          description TEXT DEFAULT '',
          image_path TEXT,
          active INTEGER NOT NULL DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          price_per_km REAL NOT NULL DEFAULT 0,
          flat_fee REAL,
          tenant_id INTEGER
        )
      `);

      getSqlite().exec(`
        INSERT INTO vehicles_new (id, name, license_plate, type, description, image_path, active, created_at, price_per_km, flat_fee, tenant_id)
        SELECT id, name, license_plate, type, description, NULL, active, created_at, price_per_km, flat_fee, tenant_id
        FROM vehicles
      `);

      getSqlite().exec('DROP TABLE vehicles');
      getSqlite().exec('ALTER TABLE vehicles_new RENAME TO vehicles');
      getSqlite().exec('CREATE INDEX IF NOT EXISTS idx_vehicles_tenant_id ON vehicles(tenant_id)');
      getSqlite().exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_tenant_license_plate_unique ON vehicles(tenant_id, license_plate)');
      getSqlite().exec('COMMIT');
    } catch (err) {
      getSqlite().exec('ROLLBACK');
      throw err;
    } finally {
      getSqlite().exec('PRAGMA foreign_keys = ON');
    }
  } else {
    getSqlite().exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_tenant_license_plate_unique ON vehicles(tenant_id, license_plate)');
  }

  getSqlite().exec('CREATE INDEX IF NOT EXISTS idx_waitlist_slot ON waitlist(vehicle_id, date, date_to, time_from, time_to, status)');
}

export async function initDb() {
  if (IS_POSTGRES) {
    await getPool().query(PG_SCHEMA);
    await ensurePgMigrations();
    console.log('🐘 PostgreSQL verbunden und Schema bereit.');
  } else {
    getSqlite().exec(SQLITE_SCHEMA);
    ensureSqliteMigrations();
    console.log('🗄️  SQLite verbunden und Schema bereit.');
  }
}

// ─── Public exports ───────────────────────────────────────────────────────────

export const db = {
  queryOne: IS_POSTGRES ? pgQueryOne : sqliteQueryOne,
  queryMany: IS_POSTGRES ? pgQueryMany : sqliteQueryMany,
  execute: IS_POSTGRES ? pgExecute : sqliteExecute,
};
