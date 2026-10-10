/**
 * Metadata lookups for the dashboard: Deezer's public API for search/browse and
 * lrclib.net for lyrics. Playback itself always goes through Lavalink.
 */
import { firstArtist, norm } from '../utils/trackKey.js';

const DEEZER = 'https://api.deezer.com';
const LRCLIB = 'https://lrclib.net/api';
const UA = 'RaeMusicBot/1.0 (https://github.com/urfavteddybear/rae)';

const cache = new Map();

async function cached(key, ttlMs, load) {
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.value;
  const value = await load();
  cache.set(key, { value, exp: Date.now() + ttlMs });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return value;
}

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`${new URL(url).host} responded ${res.status}`);
  return res.json();
}

const mapTrack = (t) => ({
  id: String(t.id),
  title: t.title,
  author: t.artist?.name ?? 'Unknown',
  album: t.album?.title ?? null,
  albumId: t.album?.id ? String(t.album.id) : null,
  artistId: t.artist?.id ? String(t.artist.id) : null,
  duration: (t.duration ?? 0) * 1000,
  artwork: t.album?.cover_medium ?? t.album?.cover ?? null,
  explicit: !!t.explicit_lyrics,
  url: `https://www.deezer.com/track/${t.id}`,
});

const mapAlbum = (a) => ({
  id: String(a.id),
  title: a.title,
  author: a.artist?.name ?? null,
  artwork: a.cover_big ?? a.cover_medium ?? null,
  url: `https://www.deezer.com/album/${a.id}`,
});

const mapArtist = (a) => ({
  id: String(a.id),
  name: a.name,
  picture: a.picture_xl ?? a.picture_big ?? a.picture_medium ?? null,
  fans: a.nb_fan ?? null,
  url: `https://www.deezer.com/artist/${a.id}`,
});

/**
 * The Deezer link for a song known only by title and artist (for example one that was played from
 * Spotify). Only an exact title and artist match is accepted; returns null otherwise.
 */
export function findSong(title, author) {
  return cached(`song:${norm(title)}|${norm(firstArtist(author))}`, 6 * 60 * 60_000, async () => {
    const plainTitle = title.replace(/\s*[(\[].*?[)\]]/g, '').trim() || title;
    const res = await getJson(`${DEEZER}/search?q=${encodeURIComponent(`${firstArtist(author)} ${plainTitle}`)}&limit=5`);
    const wantTitle = norm(title);
    const wantArtist = norm(firstArtist(author));
    const hit = (res.data ?? []).find((t) => {
      const name = norm(t.artist?.name);
      return norm(t.title) === wantTitle && (name.includes(wantArtist) || wantArtist.includes(name));
    });
    return hit ? `https://www.deezer.com/track/${hit.id}` : null;
  });
}

export function search(q) {
  return cached(`search:${q.toLowerCase()}`, 5 * 60_000, async () => {
    const enc = encodeURIComponent(q);
    const [tracks, albums, artists] = await Promise.all([
      getJson(`${DEEZER}/search?q=${enc}&limit=20`),
      getJson(`${DEEZER}/search/album?q=${enc}&limit=12`),
      getJson(`${DEEZER}/search/artist?q=${enc}&limit=12`),
    ]);
    return {
      tracks: (tracks.data ?? []).map(mapTrack),
      albums: (albums.data ?? []).map(mapAlbum),
      artists: (artists.data ?? []).map(mapArtist),
    };
  });
}

export function album(id) {
  return cached(`album:${id}`, 30 * 60_000, async () => {
    const a = await getJson(`${DEEZER}/album/${id}`);
    const albumTracks = (a.tracks?.data ?? []).map((t) => mapTrack({ ...t, album: { id: a.id, title: a.title, cover_medium: a.cover_medium } }));
    return {
      ...mapAlbum(a),
      year: a.release_date?.slice(0, 4) ?? null,
      duration: (a.duration ?? 0) * 1000,
      tracks: albumTracks,
    };
  });
}

export function artist(id) {
  return cached(`artist:${id}`, 30 * 60_000, async () => {
    const [a, top] = await Promise.all([
      getJson(`${DEEZER}/artist/${id}`),
      getJson(`${DEEZER}/artist/${id}/top?limit=20`),
    ]);
    return { ...mapArtist(a), tracks: (top.data ?? []).map(mapTrack) };
  });
}

/** "[01:23.45] text" lines → [{ time(ms), text }] sorted by time. */
function parseLrc(lrc) {
  const lines = [];
  for (const raw of lrc.split('\n')) {
    const m = raw.match(/^((?:\[\d+:\d+(?:\.\d+)?\])+)\s*(.*)$/);
    if (!m) continue;
    for (const stamp of m[1].matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)) {
      lines.push({ time: Math.round((Number(stamp[1]) * 60 + Number(stamp[2])) * 1000), text: m[2] });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}

export function lyrics(title, artistName, durationMs) {
  const key = `lyrics:${title}|${artistName}|${Math.round(durationMs / 1000)}`;
  return cached(key, 60 * 60_000, async () => {
    const clean = title.replace(/\s*[(\[].*?(feat|with|remaster|live).*?[)\]]/gi, '').trim() || title;
    const firstArtist = (artistName ?? '').split(/,|&/)[0].trim();

    const get = new URL(`${LRCLIB}/get`);
    get.searchParams.set('track_name', clean);
    get.searchParams.set('artist_name', firstArtist);
    if (durationMs) get.searchParams.set('duration', String(Math.round(durationMs / 1000)));

    let hit = null;
    try {
      hit = await getJson(get.toString());
    } catch { /* fall through to fuzzy search */ }

    if (!hit?.syncedLyrics && !hit?.plainLyrics) {
      try {
        const results = await getJson(`${LRCLIB}/search?q=${encodeURIComponent(`${clean} ${firstArtist}`)}`);
        hit = results.find((r) => r.syncedLyrics) ?? results.find((r) => r.plainLyrics) ?? null;
      } catch { /* no lyrics */ }
    }

    if (!hit) return { synced: null, plain: null };
    return {
      synced: hit.syncedLyrics ? parseLrc(hit.syncedLyrics) : null,
      plain: hit.plainLyrics ?? null,
    };
  });
}

const IMAGE_HOSTS = ['dzcdn.net', 'deezer.com', 'scdn.co', 'ytimg.com', 'googleusercontent.com', 'sndcdn.com', 'mzstatic.com', 'discordapp.com', 'discordapp.net'];

/** Raster formats only: an SVG served from our origin could run script if opened directly. */
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_REQUESTS = 8;
let imageRequests = 0;

/** Read a response body, giving up as soon as it exceeds `limit` bytes. */
async function readCapped(res, limit) {
  const declared = Number(res.headers.get('content-length'));
  if (declared > limit) return null;
  const chunks = [];
  let size = 0;
  for await (const chunk of res.body) {
    size += chunk.length;
    if (size > limit) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** Fetch an allow-listed image so the dashboard can read its pixels for colour extraction. */
export async function proxyImage(rawUrl) {
  let url;
  try { url = new URL(rawUrl); } catch { return null; }
  if (url.protocol !== 'https:' || url.port || url.username || url.password) return null;
  if (!IMAGE_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`))) return null;
  if (imageRequests >= MAX_IMAGE_REQUESTS) return null;

  imageRequests += 1;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000), redirect: 'error' });
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!res.ok || !IMAGE_TYPES.has(type)) return null;
    const buf = await readCapped(res, MAX_IMAGE_BYTES);
    return buf ? { type, buf } : null;
  } finally {
    imageRequests -= 1;
  }
}
