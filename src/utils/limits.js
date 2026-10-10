/** Shared safety limits for user-supplied input (slash commands and the dashboard). */

// Unlimited unless QUEUE_LIMIT is set to a positive number.
export const MAX_QUEUE_SIZE = Number(process.env.QUEUE_LIMIT) > 0 ? Number(process.env.QUEUE_LIMIT) : Infinity;
export const MAX_QUERY_LENGTH = 300;

// Lavalink's `http` source will fetch any URL it is given, so only known music hosts are accepted.
const DEFAULT_URL_HOSTS = [
  'deezer.com', 'deezer.page.link', 'dzr.page.link',
  'spotify.com', 'spotify.link',
  'music.apple.com', 'apple.com',
  'youtube.com', 'youtu.be',
  'soundcloud.com',
  'bandcamp.com',
  'twitch.tv',
  'vimeo.com',
  'nicovideo.jp',
];

const extraHosts = (process.env.ALLOWED_URL_HOSTS ?? '')
  .split(',')
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

const URL_HOSTS = [...DEFAULT_URL_HOSTS, ...extraHosts];

export function isAllowedUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { return false; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return URL_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

/** IDs allowed to see operational details (e.g. Lavalink node addresses). */
export const OWNER_IDS = new Set((process.env.OWNER_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean));
