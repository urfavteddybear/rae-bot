/**
 * Play history for the dashboard's Profile page, kept in a SQLite file (default data/rae.db).
 *
 * Uses Node's built-in `node:sqlite`, so there is nothing to compile or install. It needs Node 22.13+;
 * on older versions the bot still runs and profiles are simply unavailable.
 *
 * A play is recorded when a song starts, for the person who queued it. Songs queued by autoplay
 * belong to nobody and are not recorded. A profile belongs to the Discord account, so it covers every
 * server (the server is still stored with each play).
 */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { log } from './logger.js';
import { keyOf } from './trackKey.js';

const SNOWFLAKE = /^\d{15,22}$/;

let db = null;
let statements = null;

/** Open the database (creating it if needed). Call once at startup. */
export async function initDatabase() {
  const file = resolve(process.env.DB_PATH ?? 'data/rae.db');
  try {
    const { DatabaseSync } = await import('node:sqlite');
    mkdirSync(dirname(file), { recursive: true });
    db = new DatabaseSync(file);
    db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS plays (
        id        INTEGER PRIMARY KEY,
        guild_id  TEXT    NOT NULL,
        user_id   TEXT    NOT NULL,
        track_key TEXT    NOT NULL,
        title     TEXT    NOT NULL,
        author    TEXT,
        artwork   TEXT,
        uri       TEXT,
        played_at INTEGER NOT NULL
      );
      DROP INDEX IF EXISTS plays_by_user;
      DROP INDEX IF EXISTS plays_by_song;
      CREATE INDEX IF NOT EXISTS plays_user_time ON plays (user_id, played_at);
      CREATE INDEX IF NOT EXISTS plays_user_song ON plays (user_id, track_key);
    `);
    statements = {
      insert: db.prepare('INSERT INTO plays (guild_id, user_id, track_key, title, author, artwork, uri, played_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
      totals: db.prepare('SELECT COUNT(*) AS plays, COUNT(DISTINCT track_key) AS songs, MIN(played_at) AS first, MAX(played_at) AS last FROM plays WHERE user_id = ?'),
      // Bare columns in a GROUP BY with MAX() come from the row holding the maximum, i.e. the latest play.
      onRepeat: db.prepare('SELECT track_key AS key, COUNT(*) AS plays, MAX(played_at) AS last, title, author, artwork, uri FROM plays WHERE user_id = ? GROUP BY track_key ORDER BY plays DESC, last DESC LIMIT ?'),
      lately: db.prepare('SELECT track_key AS key, MAX(played_at) AS last, title, author, artwork, uri FROM plays WHERE user_id = ? GROUP BY track_key ORDER BY last DESC LIMIT ?'),
      reset: db.prepare('DELETE FROM plays WHERE user_id = ?'),
    };
    log.info(`Profile stats enabled (${file})`);
  } catch (err) {
    db = null;
    log.warn(`Profile stats unavailable: ${err.message}. They need Node 22.13+ and a writable data folder.`);
  }
}

export const databaseAvailable = () => db !== null;

/** Record that `track` started playing in a server. Does nothing for autoplay songs or without a database. */
export function recordPlay(guildId, track) {
  const user = track?.requester;
  if (!db || !SNOWFLAKE.test(String(user?.id ?? '')) || !track.info?.title) return;
  try {
    statements.insert.run(
      guildId,
      user.id,
      keyOf(track.info.title, track.info.author),
      track.info.title,
      track.info.author ?? null,
      track.info.artworkUrl ?? null,
      track.info.uri ?? null,
      Date.now(),
    );
  } catch (err) {
    log.warn(`Could not record play: ${err.message}`);
  }
}

const plain = (row) => ({ ...row });

/** One person's stats across all servers. */
export function getProfile(userId) {
  const totals = statements.totals.get(userId);
  return {
    plays: totals.plays,
    songs: totals.songs,
    firstPlayed: totals.first ?? null,
    lastPlayed: totals.last ?? null,
    // "On repeat" is only for songs played more than once.
    onRepeat: statements.onRepeat.all(userId, 5).filter((r) => r.plays > 1).map(plain),
    lately: statements.lately.all(userId, 12).map(plain),
  };
}

/** Delete one person's history (all servers). */
export function resetProfile(userId) {
  statements.reset.run(userId);
}
