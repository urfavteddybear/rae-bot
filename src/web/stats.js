/**
 * In-memory "in the room" stats per guild: tracks played, listening time and
 * most played artist for the current voice session. Resets when the player is destroyed.
 */

/** @type {Map<string, { tracks: number, listeningMs: number, artists: Map<string, number> }>} */
const stats = new Map();

export function getStats(guildId) {
  return stats.get(guildId) ?? null;
}

export function registerStatsListeners(lavalink) {
  lavalink.on('trackStart', (player, track) => {
    if (!track) return;
    const s = stats.get(player.guildId) ?? { tracks: 0, listeningMs: 0, artists: new Map() };
    s.tracks += 1;
    const artist = (track.info.author ?? '').split(/,|&/)[0].trim();
    if (artist) s.artists.set(artist, (s.artists.get(artist) ?? 0) + 1);
    stats.set(player.guildId, s);
  });

  lavalink.on('trackEnd', (player, track, payload) => {
    const s = stats.get(player.guildId);
    if (!s || !track) return;
    const duration = track.info.duration || 0;
    const played = payload?.reason === 'finished' ? duration : Math.min(player.position || 0, duration);
    s.listeningMs += played;
  });

  lavalink.on('playerDestroy', (player) => {
    stats.delete(player.guildId);
  });
}
