import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';
import { log } from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', 'data');

mkdirSync(DATA_DIR, { recursive: true });

/** @type {Database.Database} */
let db;

export function initDatabase() {
  db = new Database(join(DATA_DIR, 'rae.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS guilds (
      id          TEXT PRIMARY KEY,
      stay247     INTEGER NOT NULL DEFAULT 0
    );
  `);

  log.info('Database initialised');
  return db;
}

export function getDb() {
  return db;
}

// ── Guild helpers ──────────────────────────────────────────────────────────

/** Ensure a guild row exists, return the row. */
export function getGuild(guildId) {
  let row = db.prepare('SELECT * FROM guilds WHERE id = ?').get(guildId);
  if (!row) {
    db.prepare('INSERT OR IGNORE INTO guilds (id) VALUES (?)').run(guildId);
    row = db.prepare('SELECT * FROM guilds WHERE id = ?').get(guildId);
  }
  return row;
}

/** Toggle or set 24/7 mode. Returns new value. */
export function setStay247(guildId, value) {
  getGuild(guildId); // ensure row
  db.prepare('UPDATE guilds SET stay247 = ? WHERE id = ?').run(value ? 1 : 0, guildId);
  return !!value;
}

export function getStay247(guildId) {
  const row = getGuild(guildId);
  return row.stay247 === 1;
}
