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
let stmtGetGuild;
let stmtInsertGuild;
let stmtSetStay247On;
let stmtSetStay247Off;

export function initDatabase() {
  db = new Database(join(DATA_DIR, 'rae.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('cache_size = -2000');

  db.exec(`
    CREATE TABLE IF NOT EXISTS guilds (
      id               TEXT PRIMARY KEY,
      stay247          INTEGER NOT NULL DEFAULT 0,
      voice_channel_id TEXT,
      text_channel_id  TEXT
    );
  `);

  // Safely migrate existing tables if columns are missing
  try { db.exec('ALTER TABLE guilds ADD COLUMN voice_channel_id TEXT;'); } catch {}
  try { db.exec('ALTER TABLE guilds ADD COLUMN text_channel_id TEXT;'); } catch {}

  stmtGetGuild = db.prepare('SELECT * FROM guilds WHERE id = ?');
  stmtInsertGuild = db.prepare('INSERT OR IGNORE INTO guilds (id) VALUES (?)');
  stmtSetStay247On = db.prepare(
    'UPDATE guilds SET stay247 = 1, voice_channel_id = ?, text_channel_id = ? WHERE id = ?'
  );
  stmtSetStay247Off = db.prepare(
    'UPDATE guilds SET stay247 = 0, voice_channel_id = NULL, text_channel_id = NULL WHERE id = ?'
  );

  log.info('Database initialised');
  return db;
}

export function getDb() {
  return db;
}

// ── Guild helpers ──────────────────────────────────────────────────────────

/** Ensure a guild row exists, return the row. */
export function getGuild(guildId) {
  let row = stmtGetGuild.get(guildId);
  if (!row) {
    stmtInsertGuild.run(guildId);
    row = stmtGetGuild.get(guildId);
  }
  return row;
}

/** Toggle or set 24/7 mode with voice/text channel targets. */
export function setStay247(guildId, value, voiceChannelId = null, textChannelId = null) {
  getGuild(guildId); // ensure row exists
  if (value) {
    stmtSetStay247On.run(voiceChannelId, textChannelId, guildId);
    return true;
  }
  stmtSetStay247Off.run(guildId);
  return false;
}

export function getStay247(guildId) {
  const row = getGuild(guildId);
  return row?.stay247 === 1;
}

export function getStay247Data(guildId) {
  const row = getGuild(guildId);
  return {
    stay247: row?.stay247 === 1,
    voiceChannelId: row?.voice_channel_id ?? null,
    textChannelId: row?.text_channel_id ?? null,
  };
}
