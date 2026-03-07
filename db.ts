import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');
mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(join(DATA_DIR, 'tokens.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    email TEXT PRIMARY KEY,
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS token_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    delta INTEGER NOT NULL,
    reason TEXT NOT NULL,
    ref TEXT,
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS device_email_map (
    device_id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
  );
`);

export function getBalance(email: string): number {
  const row = db
    .prepare('SELECT COALESCE(SUM(delta), 0) AS balance FROM token_ledger WHERE email = ?')
    .get(email) as { balance: number };
  return row.balance;
}

export function deductToken(
  identifier: string,
  reason: string,
  ref: string
): { success: boolean; newBalance: number } {
  return deductTokens(identifier, 1, reason, ref);
}

export function deductTokens(
  identifier: string,
  count: number,
  reason: string,
  ref: string
): { success: boolean; newBalance: number } {
  const balance = getBalance(identifier);
  if (balance < count) return { success: false, newBalance: balance };
  const stmt = db.prepare('INSERT INTO token_ledger (email, delta, reason, ref) VALUES (?, -1, ?, ?)');
  const deductMany = db.transaction(() => {
    for (let i = 0; i < count; i++) {
      stmt.run(identifier, reason, `${ref}-${i}`);
    }
  });
  deductMany();
  return { success: true, newBalance: balance - count };
}

export function initDevice(deviceId: string): number {
  const existing = db.prepare('SELECT email FROM users WHERE email = ?').get(deviceId);
  if (!existing) {
    db.prepare('INSERT OR IGNORE INTO users (email) VALUES (?)').run(deviceId);
    db.prepare(
      'INSERT INTO token_ledger (email, delta, reason, ref) VALUES (?, 12, ?, ?)'
    ).run(deviceId, 'welcome', 'initial-grant');
  }
  return getBalance(deviceId);
}

export function linkEmailToDevice(deviceId: string, email: string): void {
  db.prepare('INSERT OR IGNORE INTO users (email) VALUES (?)').run(email);
  db.prepare('INSERT OR REPLACE INTO device_email_map (device_id, email) VALUES (?, ?)').run(deviceId, email);
}

export function getDeviceIdByEmail(email: string): string | null {
  const row = db
    .prepare('SELECT device_id FROM device_email_map WHERE email = ?')
    .get(email) as { device_id: string } | undefined;
  return row?.device_id ?? null;
}

export function creditTokens(email: string, delta: number, reason: string, ref: string): void {
  db.prepare('INSERT OR IGNORE INTO users (email) VALUES (?)').run(email);
  db.prepare(
    'INSERT INTO token_ledger (email, delta, reason, ref) VALUES (?, ?, ?, ?)'
  ).run(email, delta, reason, ref);
}

export function isOrderAlreadyCredited(orderId: string): boolean {
  const row = db
    .prepare("SELECT id FROM token_ledger WHERE ref = ? AND reason = 'purchase' LIMIT 1")
    .get(orderId);
  return !!row;
}
