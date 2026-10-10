/**
 * Autoplay: when the queue runs out, queue the songs most similar to the last song.
 *
 * One song is the seed: the one playing when the queue runs out, or the one a person just chose to play
 * right now. Its 20 strongest matches are queued, and when those run out the last song seeds the next 20.
 *
 * With LASTFM_API_KEY set, similar songs come from Last.fm, strongest match first (Deezer only looks
 * them up). Without it, or when Last.fm knows nothing about the song, they come from Deezer's public API:
 * the artist's radio plus the top songs of similar artists. Songs from any source (Spotify, Apple Music,
 * ...) are mapped to Deezer by ISRC, falling back to a title + artist search. Playback always goes
 * through Lavalink using the Deezer link.
 */
import { log } from './logger.js';
import { MAX_QUEUE_SIZE } from './limits.js';

const DEEZER = 'https://api.deezer.com';
const LASTFM = 'https://ws.audioscrobbler.com/2.0/';

const BATCH = 20;              // songs queued per refill
const RADIO_TOP = 25;
const RELATED_ARTISTS = 3;
const RELATED_TRACKS = 6;
const MIN_SECONDS = 100;
const SEEN_MAX = 100;          // how many recent songs never to repeat
const FETCH_TIMEOUT_MS = 6000;
const BAD_VERSION = /\b(acoustic|karaoke|instrumental|live|cover|tribute|lullaby|piano version|8d|slowed|sped up|speed up|nightcore|reverb|party tyme|made popular by|singers)\b/i;

const AUTOPLAY_REQUESTER = { id: 'autoplay', username: 'Autoplay', tag: 'Autoplay' };

// ── Small helpers ──────────────────────────────────────────────────────────

const cache = new Map();

async function cached(key, ttlMs, load) {
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.value;
  const value = await load();
  cache.set(key, { value, exp: Date.now() + ttlMs });
  if (cache.size > 1000) cache.delete(cache.keys().next().value);
  return value;
}

async function deezer(path) {
  const res = await fetch(DEEZER + path, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Deezer responded ${res.status}`);
  const data = await res.json();
  if (data?.error) throw new Error(data.error.message ?? 'Deezer error');
  return data;
}

const norm = (s) => String(s ?? '').toLowerCase().replace(/\s*[(\[].*?[)\]]/g, '').replace(/[^a-z0-9 ]/g, '').trim();
const firstArtist = (s) => String(s ?? '').split(/,|&|\bfeat\.?\b|\bft\.?\b/i)[0].trim() || String(s ?? '');
const keyOf = (title, artist) => `${norm(title)}|${norm(firstArtist(artist))}`;
const quoteSafe = (s) => String(s ?? '').replace(/[(\[].*?[)\]]/g, '').replace(/["\\]/g, ' ').trim();

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const lastfmEnabled = () => !!process.env.LASTFM_API_KEY;

// ── Mapping songs onto Deezer ──────────────────────────────────────────────

/** The Deezer track for a Lavalink track, or null when it can't be matched. */
function resolveDeezer(track) {
  const { info } = track;
  return cached(`seed:${info.sourceName}:${info.identifier}`, 6 * 60 * 60_000, async () => {
    if (info.sourceName === 'deezer' && /^\d+$/.test(info.identifier ?? '')) return deezer(`/track/${info.identifier}`);
    if (info.isrc) {
      try {
        const t = await deezer(`/track/isrc:${encodeURIComponent(info.isrc)}`);
        if (t?.id) return t;
      } catch { /* fall through to a text search */ }
    }
    return findOnDeezer(firstArtist(info.author), info.title);
  });
}

/**
 * Find a song on Deezer by artist and title. Deezer's `artist:"..."` filters are unreliable, so this
 * does a plain search and only accepts a result whose title and artist really match.
 */
function findOnDeezer(artist, title) {
  return cached(`find:${keyOf(title, artist)}`, 6 * 60 * 60_000, async () => {
    const res = await deezer(`/search?q=${encodeURIComponent(`${quoteSafe(artist)} ${quoteSafe(title)}`)}&limit=5`);
    const wantTitle = norm(title);
    const wantArtist = norm(firstArtist(artist));
    return (res.data ?? []).find((t) => {
      const artistName = norm(t.artist?.name);
      return norm(t.title) === wantTitle && (artistName.includes(wantArtist) || wantArtist.includes(artistName));
    }) ?? null;
  });
}

function albumGenres(albumId) {
  if (!albumId) return Promise.resolve([]);
  return cached(`genres:${albumId}`, 24 * 60 * 60_000, async () => {
    const album = await deezer(`/album/${albumId}`);
    return (album.genres?.data ?? []).map((g) => g.id).filter((id) => id !== 0);
  });
}

/** Radio + similar artists' top songs for one artist. */
function artistPools(artistId) {
  return cached(`pools:${artistId}`, 15 * 60_000, async () => {
    // Independent: some artists have a radio but no similar artists (or the other way round).
    const [radio, related] = await Promise.all([
      deezer(`/artist/${artistId}/radio?limit=${RADIO_TOP}`).catch(() => ({ data: [] })),
      deezer(`/artist/${artistId}/related?limit=${RELATED_ARTISTS}`).catch(() => ({ data: [] })),
    ]);
    const tops = await Promise.all((related.data ?? []).map((a) =>
      deezer(`/artist/${a.id}/top?limit=${RELATED_TRACKS}`).then((r) => r.data ?? []).catch(() => [])));
    return { radio: radio.data ?? [], related: tops.flat() };
  });
}

/** Last.fm's similar songs as { title, artist, match }, strongest first. Empty without a key or on error. */
function lastfmSimilar(artist, title) {
  if (!lastfmEnabled()) return Promise.resolve([]);
  return cached(`lastfm:${keyOf(title, artist)}`, 30 * 60_000, async () => {
    const url = new URL(LASTFM);
    url.search = new URLSearchParams({
      method: 'track.getsimilar',
      artist: firstArtist(artist),
      track: title.replace(/\s*[(\[].*?[)\]]/g, '').trim(),
      autocorrect: '1',
      limit: '100',
      api_key: process.env.LASTFM_API_KEY,
      format: 'json',
    }).toString();
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    const data = await res.json().catch(() => ({}));
    if (data.error) throw new Error(`Last.fm: ${data.message}`);
    return (data.similartracks?.track ?? [])
      .map((t) => ({ title: t.name, artist: t.artist?.name ?? '', match: Number(t.match) || 0 }))
      .sort((a, b) => b.match - a.match);
  }).catch((err) => {
    // "Track not found" just means Last.fm has no data for this song; not worth a warning.
    if (!/not found/i.test(err.message)) log.warn(`autoplay: ${err.message}`);
    return [];
  });
}

// ── Choosing songs ─────────────────────────────────────────────────────────

/** Every song to avoid: what's playing, recent history, what's already queued, and past autoplay picks. */
function collectSeen(player) {
  const seen = new Set(player.get('autoplaySeen') ?? []);
  const tracks = [player.queue.current, ...player.queue.previous, ...player.queue.tracks].filter(Boolean);
  for (const t of tracks) seen.add(keyOf(t.info.title, t.info.author));
  return seen;
}

function rememberSeen(player, keys) {
  const list = [...(player.get('autoplaySeen') ?? []), ...keys];
  player.set('autoplaySeen', list.slice(-SEEN_MAX));
}

/** Is this Deezer track acceptable as the next song? */
function acceptable(ctx, t) {
  if (!t?.id || !t.title || !t.artist) return false;
  if (BAD_VERSION.test(t.title) || BAD_VERSION.test(t.artist.name ?? '')) return false;
  if (t.duration && t.duration < MIN_SECONDS) return false;
  return !ctx.seen.has(keyOf(t.title, t.artist.name));
}

function accept(ctx, track) {
  ctx.seen.add(keyOf(track.title, track.artist.name));
  return track;
}

/** The strongest Last.fm match that is playable and not played yet. */
async function pickLastfm(ctx) {
  for (const c of ctx.lastfm.slice(0, 60)) {
    if (BAD_VERSION.test(c.title) || ctx.seen.has(keyOf(c.title, c.artist))) continue;
    const track = await findOnDeezer(c.artist, c.title).catch(() => null);
    if (acceptable(ctx, track)) return accept(ctx, track);
  }
  return null;
}

/** Deezer's own picks: used only when Last.fm has nothing for the song. */
async function loadDeezerPools(ctx) {
  if (ctx.deezerPools) return;
  ctx.deezerPools = { radio: [], related: [], genres: [] };
  const seed = await resolveDeezer(ctx.seed).catch(() => null);
  if (!seed?.artist?.id) return;
  try {
    const p = await artistPools(seed.artist.id);
    ctx.deezerPools.radio = p.radio;
    ctx.deezerPools.related = p.related;
  } catch (err) { log.warn(`autoplay: ${err.message}`); }
  ctx.deezerPools.genres = await albumGenres(seed.album?.id).catch(() => []);
}

async function pickDeezer(ctx) {
  const { radio, related, genres } = ctx.deezerPools;
  const order = Math.random() < 0.5 ? [['related', related], ['radio', radio]] : [['radio', radio], ['related', related]];
  for (const [name, pool] of order) {
    for (const t of shuffle(pool.filter((x) => acceptable(ctx, x))).slice(0, 8)) {
      if (name === 'radio' && genres.length) {
        // Radio blends in loosely related artists; keep it in the genre being played.
        const g = await albumGenres(t.album?.id).catch(() => []);
        if (!g.some((id) => genres.includes(id))) continue;
      }
      return accept(ctx, t);
    }
  }
  return null;
}

async function toLavalinkTrack(player, deezerTrack) {
  const res = await player.search({ query: `https://www.deezer.com/track/${deezerTrack.id}` }, AUTOPLAY_REQUESTER);
  return res?.loadType === 'track' || res?.tracks?.length ? res.tracks[0] : null;
}

/** Last resort when nothing could be mapped to Deezer: search by the seed, minus anything seen. */
async function fallbackTrack(player, seed, seen) {
  const engine = process.env.DEFAULT_SEARCH_ENGINE ?? 'dzsearch';
  const res = await player.search({ query: `${engine}:${seed.info.author} ${seed.info.title}` }, AUTOPLAY_REQUESTER);
  return res?.tracks?.find((t) => !seen.has(keyOf(t.info.title, t.info.author)) && !BAD_VERSION.test(t.info.title)) ?? null;
}

const generation = (player) => player.get('autoplayGen') ?? 0;

/** Remove the songs autoplay queued (songs people queued stay). */
async function removeQueuedAutoplay(player) {
  const tracks = player.queue.tracks;
  for (let i = tracks.length - 1; i >= 0; i--) {
    if (tracks[i].requester?.id === AUTOPLAY_REQUESTER.id) await player.queue.splice(i, 1);
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Queue the songs most similar to the current song, once the queue has run out. Called whenever a song
 * starts, so the refill happens while the last queued song plays and there is no gap. Returns how many
 * were added. Safe to call often: it does nothing when autoplay is off, songs are still queued, or a
 * refill is already running.
 */
export async function topUpAutoplay(player, count = BATCH) {
  if (!player.get('autoplay') || player.get('autoplayBusy')) return 0;
  if (player.queue.tracks.length > 0) return 0;
  const need = Math.min(count, MAX_QUEUE_SIZE);
  const seed = player.queue.current ?? player.queue.previous[0];
  if (need <= 0 || !seed) return 0;

  player.set('autoplayBusy', true);
  const gen = generation(player);
  let added = 0;
  let stale = false;
  try {
    const ctx = { seed, lastfm: await lastfmSimilar(seed.info.author, seed.info.title), seen: collectSeen(player), deezerPools: null };
    const useLastfm = ctx.lastfm.length > 0;
    if (!useLastfm) await loadDeezerPools(ctx);

    for (let i = 0; i < need; i++) {
      let pick = useLastfm ? await pickLastfm(ctx) : await pickDeezer(ctx);
      // Last.fm knew the song but nothing it suggested could be played: fall back to Deezer's picks.
      if (!pick && useLastfm && !added) {
        await loadDeezerPools(ctx);
        pick = await pickDeezer(ctx);
      }
      if (!pick) break;
      const track = await toLavalinkTrack(player, pick).catch(() => null);
      if (!track) continue;
      // A person picked a different song while this was running: this batch is for the wrong seed.
      if (generation(player) !== gen) { stale = true; break; }
      await player.queue.add(track);
      added += 1;
    }
    if (!added && !stale) {
      const track = await fallbackTrack(player, seed, ctx.seen).catch(() => null);
      if (track && generation(player) === gen) {
        await player.queue.add(track);
        added += 1;
      }
    }
    if (added) rememberSeen(player, player.queue.tracks.slice(-added).map((t) => keyOf(t.info.title, t.info.author)));
  } catch (err) {
    log.warn(`autoplay: ${err.message}`);
  } finally {
    player.set('autoplayBusy', false);
  }
  if (stale) topUpAutoplay(player, count).catch(() => {});
  return added;
}

/**
 * A person chose a song to play right now. Whatever autoplay had queued was based on the previous
 * song, so drop it and queue a fresh batch based on this one.
 */
export async function resetAutoplay(player) {
  if (!player.get('autoplay')) return;
  player.set('autoplayGen', generation(player) + 1);
  await removeQueuedAutoplay(player);
  topUpAutoplay(player).catch(() => {});
}

/** Turn autoplay on or off. Turning it off removes the songs autoplay queued. */
export async function setAutoplay(player, enabled) {
  if (!enabled) {
    player.set('autoplay', false);
    player.set('autoplayGen', generation(player) + 1);
    await removeQueuedAutoplay(player);
    return;
  }
  player.set('autoplay', true);
  if (player.queue.current) topUpAutoplay(player).catch(() => {});
}
