import 'dotenv/config';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db, initDb } from '../src/db/client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultDbPath = path.join(__dirname, '../data/fabu.db');
const dbPath = process.env.SQLITE_DB_PATH || defaultDbPath;

if (process.env.DB_CLIENT === 'postgres') {
  throw new Error('seed-e2e.js ist nur fuer SQLite-Testdaten gedacht.');
}

for (const suffix of ['', '-wal', '-shm']) {
  try {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  } catch {
    // Ignore cleanup errors for non-existing files.
  }
}

await initDb();

const superAdminPassword = 'Secret123!';
const tenantAdminPassword = 'Secret123!';
const tenantUserPassword = 'Secret123!';

const [superAdminHash, tenantAdminHash, tenantUserHash] = await Promise.all([
  bcrypt.hash(superAdminPassword, 10),
  bcrypt.hash(tenantAdminPassword, 10),
  bcrypt.hash(tenantUserPassword, 10),
]);

const superAdminInsert = await db.execute(
  'INSERT INTO users (name, email, password, role, super_admin) VALUES (?, ?, ?, ?, ?) RETURNING id',
  ['Super Admin', 'superadmin@fabu.test', superAdminHash, 'admin', 1]
);
const superAdminId = superAdminInsert.row?.id ?? superAdminInsert.lastInsertId;

const tenantInsert = await db.execute(
  'INSERT INTO tenants (name, created_by) VALUES (?, ?) RETURNING id',
  ['Alpha Fleet', superAdminId]
);
const tenantId = tenantInsert.row?.id ?? tenantInsert.lastInsertId;

await db.execute(
  'INSERT INTO tenant_members (tenant_id, user_id, role) VALUES (?, ?, ?)',
  [tenantId, superAdminId, 'admin']
);

const tenantAdminInsert = await db.execute(
  'INSERT INTO users (name, email, password, role, super_admin) VALUES (?, ?, ?, ?, ?) RETURNING id',
  ['Alpha Admin', 'admin@alpha.test', tenantAdminHash, 'user', 0]
);
const tenantAdminId = tenantAdminInsert.row?.id ?? tenantAdminInsert.lastInsertId;

await db.execute(
  'INSERT INTO tenant_members (tenant_id, user_id, role) VALUES (?, ?, ?)',
  [tenantId, tenantAdminId, 'admin']
);

const tenantUserInsert = await db.execute(
  'INSERT INTO users (name, email, password, role, super_admin) VALUES (?, ?, ?, ?, ?) RETURNING id',
  ['Alpha User', 'user@alpha.test', tenantUserHash, 'user', 0]
);
const tenantUserId = tenantUserInsert.row?.id ?? tenantUserInsert.lastInsertId;

await db.execute(
  'INSERT INTO tenant_members (tenant_id, user_id, role) VALUES (?, ?, ?)',
  [tenantId, tenantUserId, 'user']
);

await db.execute(
  'INSERT INTO vehicles (tenant_id, name, license_plate, type, description, price_per_km, flat_fee, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  [tenantId, 'Seed Car', 'E2E-ALPHA-1', 'PKW', 'Seed vehicle for smoke tests', 0.35, 2.5, 1]
);

console.log(`E2E seed complete: ${dbPath}`);