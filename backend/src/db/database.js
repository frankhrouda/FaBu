import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data');
const DB_PATH = path.join(DATA_DIR, 'fabu.db');

let db;

export function getDb() {
  if (!db) {
    mkdirSync(DATA_DIR, { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
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
      license_plate TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL DEFAULT 'PKW',
      description TEXT DEFAULT '',
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
      date_to TEXT,
      time_from TEXT NOT NULL,
      time_to TEXT NOT NULL,
      reason TEXT NOT NULL,
      km_driven INTEGER,
      destination TEXT,
      status TEXT NOT NULL DEFAULT 'reserved',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
    );
  `);

  ensureColumnExists('vehicles', 'price_per_km', "REAL NOT NULL DEFAULT 0");
  ensureColumnExists('vehicles', 'flat_fee', 'REAL');
  ensureColumnExists('reservations', 'date_to', 'TEXT');
}

function ensureColumnExists(tableName, columnName, columnDef) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  const hasColumn = columns.some((column) => column.name === columnName);
  if (!hasColumn) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`);
  }
}
