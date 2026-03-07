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
`);

export function getBalance(email: string): number {
  const row = db
    .prepare('SELECT COALESCE(SUM(delta), 0) AS balance FROM token_ledger WHERE email = ?')
    .get(email) as { balance: number };
  return row.balance;
}

export function deductToken(
  email: string,
  reason: string,
  ref: string
): { success: boolean; newBalance: number } {
  const balance = getBalance(email);
  if (balance < 1) return { success: false, newBalance: balance };
  db.prepare('INSERT INTO token_ledger (email, delta, reason, ref) VALUES (?, -1, ?, ?)').run(
    email,
    reason,
    ref
  );
  return { success: true, newBalance: balance - 1 };
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
