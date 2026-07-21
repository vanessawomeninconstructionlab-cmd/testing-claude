// SQLite data layer. Creates the schema on first run and exposes the db handle.
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from './config.js';

fs.mkdirSync(config.dataDir, { recursive: true });

const dbPath = path.join(config.dataDir, 'coolair.db');
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS services (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    slug         TEXT NOT NULL UNIQUE,
    name         TEXT NOT NULL,
    category     TEXT NOT NULL,
    description  TEXT NOT NULL,
    price_cents  INTEGER NOT NULL,       -- upfront/booking price charged online
    duration_min INTEGER NOT NULL,
    icon         TEXT NOT NULL DEFAULT '🔧',
    active       INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    reference        TEXT NOT NULL UNIQUE,
    service_id       INTEGER NOT NULL REFERENCES services(id),
    customer_name    TEXT NOT NULL,
    email            TEXT NOT NULL,
    phone            TEXT NOT NULL,
    address          TEXT NOT NULL,
    city             TEXT NOT NULL,
    zip              TEXT NOT NULL,
    notes            TEXT NOT NULL DEFAULT '',
    scheduled_date   TEXT NOT NULL,      -- YYYY-MM-DD
    scheduled_time   TEXT NOT NULL,      -- HH:MM (24h)
    amount_cents     INTEGER NOT NULL,
    status           TEXT NOT NULL DEFAULT 'pending',   -- pending|confirmed|completed|cancelled
    payment_status   TEXT NOT NULL DEFAULT 'unpaid',    -- unpaid|paid|refunded
    payment_provider TEXT NOT NULL DEFAULT '',          -- stripe|demo
    payment_ref      TEXT NOT NULL DEFAULT '',
    created_at       TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(scheduled_date, scheduled_time);
  CREATE INDEX IF NOT EXISTS idx_bookings_ref  ON bookings(reference);
`);
