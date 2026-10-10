import { getStay247 } from '../utils/stay247.js';

const MAX_PAGE = 200;

function serializeRequester(r) {
  if (!r) return null;
  const avatar = typeof r.displayAvatarURL === 'function'
    ? r.displayAvatarURL({ size: 64, extension: 'png' })
    : null;
  return {
    id: r.id ?? null,
    name: r.globalName ?? r.username ?? r.tag ?? 'Unknown',
    avatar,
  };
}

export function serializeTrack(t) {
  if (!t) return null;
  const { info } = t;
  return {
    id: info.identifier,
    title: info.title,
    author: info.author,
    album: t.pluginInfo?.albumName ?? null,
    duration: info.duration,
    artwork: info.artworkUrl ?? null,
    uri: info.uri ?? null,
    isStream: !!info.isStream,
    source: info.sourceName ?? null,
    explicit: !!t.pluginInfo?.isExplicit,
    requester: serializeRequester(t.requester),
  };
}

export function serializeStats(stats) {
  if (!stats) return { tracks: 0, listeningMs: 0, topArtist: null };
  let topArtist = null;
  for (const [name, count] of stats.artists) {
    if (!topArtist || count > topArtist.count) topArtist = { name, count };
  }
  return { tracks: stats.tracks, listeningMs: stats.listeningMs, topArtist };
}

/**
 * One pass over a track list: a revision string that changes whenever the order or contents change
 * (so clients know when to refetch pages) plus the total duration. Cheap even for huge queues.
 */
export function summarize(tracks) {
  let hash = 2166136261;
  let duration = 0;
  for (const t of tracks) {
    const id = t.info.identifier ?? '';
    for (let i = 0; i < id.length; i++) {
      hash ^= id.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    hash ^= 124;
    duration += t.info.duration || 0;
  }
  return { rev: `${(hash >>> 0).toString(36)}.${tracks.length}`, duration };
}

/**
 * Small, guild-wide player state that is pushed live. The queue and history themselves are
 * not included; clients page them in via serializePage when `queueRev` / `historyRev` change.
 * Position is kept out so change detection ignores it.
 */
export function serializePlayer(player, stats) {
  const queue = summarize(player.queue.tracks);
  const history = summarize(player.queue.previous);
  return {
    guildId: player.guildId,
    connected: !!player.connected,
    playing: !!player.playing,
    paused: !!player.paused,
    volume: player.volume,
    repeatMode: player.repeatMode,
    autoplay: !!player.get('autoplay'),
    stay247: getStay247(player.guildId),
    voiceChannelId: player.voiceChannelId ?? null,
    current: serializeTrack(player.queue.current),
    queueTotal: player.queue.tracks.length,
    queueRev: queue.rev,
    queueDuration: queue.duration,
    historyTotal: player.queue.previous.length,
    historyRev: history.rev,
    stats: serializeStats(stats),
  };
}

export function emptyState(guildId) {
  return {
    guildId,
    connected: false,
    playing: false,
    paused: false,
    volume: 100,
    repeatMode: 'off',
    autoplay: false,
    stay247: false,
    voiceChannelId: null,
    current: null,
    queueTotal: 0,
    queueRev: '0.0',
    queueDuration: 0,
    historyTotal: 0,
    historyRev: '0.0',
    stats: serializeStats(null),
  };
}

/** A window of the queue or history. */
export function serializePage(player, kind, offset, limit) {
  const list = kind === 'queue' ? player?.queue.tracks : player?.queue.previous;
  const tracks = list ?? [];
  const start = Math.max(0, Math.floor(offset) || 0);
  const size = Math.min(MAX_PAGE, Math.max(1, Math.floor(limit) || 50));
  return {
    total: tracks.length,
    offset: start,
    rev: summarize(tracks).rev,
    items: tracks.slice(start, start + size).map(serializeTrack),
  };
}

/** Which of `ids` are the current track or sit in the queue. */
export function queuedIds(player, ids) {
  if (!player) return [];
  const wanted = new Set(ids);
  const found = new Set();
  if (player.queue.current && wanted.has(player.queue.current.info.identifier)) found.add(player.queue.current.info.identifier);
  for (const t of player.queue.tracks) {
    const id = t.info.identifier;
    if (wanted.has(id)) found.add(id);
    if (found.size === wanted.size) break;
  }
  return [...found];
}
