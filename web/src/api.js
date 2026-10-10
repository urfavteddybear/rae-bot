export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? 'Request failed', res.status);
  return data;
}

export const api = {
  me: () => request('GET', '/api/me'),
  search: (q) => request('GET', `/api/search?q=${encodeURIComponent(q)}`),
  album: (id) => request('GET', `/api/album/${id}`),
  artist: (id) => request('GET', `/api/artist/${id}`),
  lyrics: (t) => request('GET', `/api/lyrics?title=${encodeURIComponent(t.title)}&artist=${encodeURIComponent(t.author ?? '')}&duration=${t.duration ?? 0}`),
  list: (guildId, kind, offset, limit) => request('GET', `/api/guilds/${guildId}/${kind}?offset=${offset}&limit=${limit}`),
  queued: (guildId, ids) => request('GET', `/api/guilds/${guildId}/queued?ids=${ids.map(encodeURIComponent).join(',')}`),
  control: (guildId, action, body) => request('POST', `/api/guilds/${guildId}/${action}`, body ?? {}),
  logout: () => request('POST', '/auth/logout', {}),
};

/** Same-origin proxy so artwork can be read through a canvas. */
export const proxied = (url) => (url ? `/api/img?u=${encodeURIComponent(url)}` : null);

export function fmtTime(ms) {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${String(m).padStart(2, '0')}:${ss}`;
}

export function fmtLong(ms) {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  return mins % 60 ? `${h} hr ${mins % 60} min` : `${h} hr`;
}
