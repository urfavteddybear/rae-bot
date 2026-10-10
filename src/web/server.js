import crypto from 'crypto';
import http from 'http';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { WebSocketServer } from 'ws';
import { log } from '../utils/logger.js';
import { createAuth } from './auth.js';
import { perform, userVoiceChannel, ControlError } from './control.js';
import { clientIp, consume, limit } from './ratelimit.js';
import { emptyState, queuedIds, serializePage, serializePlayer } from './serialize.js';
import { getStats, registerStatsListeners } from './stats.js';
import * as catalog from './catalog.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', '..', 'web', 'dist');
const TICK_MS = 500;
const RESYNC_MS = 5000;
const MAX_SOCKETS_PER_USER = 5;
const SNOWFLAKE = /^\d{15,22}$/;

export function startWebServer(client) {
  const { CLIENT_ID, CLIENT_SECRET, BOT_TOKEN } = process.env;
  if (!CLIENT_SECRET) {
    log.info('Dashboard disabled (set CLIENT_SECRET to enable it)');
    return null;
  }

  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length < 32) {
    log.error('SESSION_SECRET must be at least 32 characters. Dashboard disabled.');
    return null;
  }

  const port = Number(process.env.WEB_PORT ?? 3000);
  const baseUrl = (process.env.DASHBOARD_URL ?? `http://localhost:${port}`).replace(/\/$/, '');
  const secure = baseUrl.startsWith('https://');
  const trustHops = Math.max(0, Number(process.env.TRUST_PROXY) || 0);
  const secret = process.env.SESSION_SECRET ?? crypto.createHash('sha256').update(`rae:${BOT_TOKEN}`).digest('hex');
  const auth = createAuth({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, baseUrl, secret });

  if (!secure && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(baseUrl)) {
    log.warn(`DASHBOARD_URL (${baseUrl}) is not HTTPS. Login cookies will travel unencrypted; put it behind HTTPS.`);
  }

  registerStatsListeners(client.lavalink);

  // ── Guild access ─────────────────────────────────────────────────────────
  const memberCache = new Map();

  /** True if the user is a member of a guild the bot is in (cached for a minute). */
  async function isMember(guildId, userId) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return false;
    const key = `${guildId}:${userId}`;
    const hit = memberCache.get(key);
    if (hit && hit.exp > Date.now()) return hit.ok;
    const ok = !!(await guild.members.fetch({ user: userId, force: false }).catch(() => null));
    memberCache.set(key, { ok, exp: Date.now() + 60_000 });
    if (memberCache.size > 5000) memberCache.delete(memberCache.keys().next().value);
    return ok;
  }

  /**
   * Guild-wide part of the live state. Built once per tick and shared by every viewer of that guild;
   * `json` is serialised once and reused for each socket.
   */
  function guildCore(guildId, cache) {
    const hit = cache?.get(guildId);
    if (hit) return hit;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return null;
    const player = client.lavalink.getPlayer(guildId);
    const base = player ? serializePlayer(player, getStats(guildId)) : emptyState(guildId);
    const botVc = base.voiceChannelId ? guild.channels.cache.get(base.voiceChannelId) : null;
    const listeners = botVc
      ? [...botVc.members.values()]
          .filter((m) => !m.user.bot)
          .slice(0, 50)
          .map((m) => ({ id: m.id, name: m.displayName, avatar: m.displayAvatarURL({ size: 64, extension: 'png' }) }))
      : [];
    const core = { ...base, listeners, voiceChannelName: botVc?.name ?? null };
    // What viewers outside the bot's voice channel get: no track, queue, stats or listeners.
    const hidden = { ...emptyState(guildId), restricted: true, listeners: [], voiceChannelName: botVc?.name ?? null };
    const entry = {
      core,
      json: JSON.stringify(core),
      hidden,
      hiddenJson: JSON.stringify(hidden),
      position: positionOf(guildId),
    };
    cache?.set(guildId, entry);
    return entry;
  }

  /**
   * Playback info (what's playing, queue, history, who's listening) is only for people in the bot's
   * voice channel. With no active player there is nothing to hide.
   */
  function canSee(guildId, userId) {
    const player = client.lavalink.getPlayer(guildId);
    if (!player) return true;
    return userVoiceChannel(client.guilds.cache.get(guildId), userId)?.id === player.voiceChannelId;
  }

  /** The viewer-specific part: where they are in voice and whether they may control playback. */
  function meFor(guildId, userId) {
    const guild = client.guilds.cache.get(guildId);
    const player = client.lavalink.getPlayer(guildId);
    const userVc = userVoiceChannel(guild, userId);
    return {
      voiceChannelId: userVc?.id ?? null,
      voiceChannelName: userVc?.name ?? null,
      canControl: !!userVc && (!player || userVc.id === player.voiceChannelId),
    };
  }

  const positionOf = (guildId) => {
    const player = client.lavalink.getPlayer(guildId);
    return player?.queue.current ? Math.round(player.position) : 0;
  };

  // ── HTTP ─────────────────────────────────────────────────────────────────
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', trustHops);

  const wsOrigin = baseUrl.replace(/^http/, 'ws');
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    `connect-src 'self' ${wsOrigin}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');

  app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', csp);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    if (secure) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
    if (req.path.startsWith('/api') || req.path.startsWith('/auth')) res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // Behind a reverse proxy every request shares the proxy's address unless TRUST_PROXY is set,
  // which would put all users in one rate-limit bucket.
  let warnedProxy = false;
  app.use((req, res, next) => {
    if (!trustHops && !warnedProxy && req.headers['x-forwarded-for']) {
      warnedProxy = true;
      log.warn('Seeing X-Forwarded-For but TRUST_PROXY is not set: rate limits will treat all users as one IP. Set TRUST_PROXY=1 behind one proxy.');
    }
    next();
  });

  // Coarse per-IP ceiling for everything, including static files.
  app.use(limit({ name: 'global', max: 600, windowMs: 60_000, trustHops }));

  // CSRF: state-changing requests must come from this origin and be JSON (which forces a CORS preflight).
  app.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    if (req.headers.origin !== baseUrl || req.headers['sec-fetch-site'] === 'cross-site') {
      return res.status(403).json({ error: 'Bad origin' });
    }
    if (!req.is('application/json')) return res.status(415).json({ error: 'Expected JSON' });
    next();
  });
  app.use(express.json({ limit: '2kb', strict: true }));

  const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((err) => {
    if (!(err instanceof ControlError)) log.warn(`web: ${req.method} ${req.path}: ${err.message}`);
    res.status(err.status ?? 500).json({ error: err instanceof ControlError ? err.message : 'Something went wrong.' });
  });

  const authLimit = limit({ name: 'auth', max: 20, windowMs: 60_000, trustHops });
  app.get('/auth/login', authLimit, auth.login);
  app.get('/auth/callback', authLimit, wrap(auth.callback));
  app.post('/auth/logout', authLimit, auth.logout);

  const api = express.Router();
  api.use((req, res, next) => {
    req.user = auth.getUser(req);
    if (!req.user) return res.status(401).json({ error: 'Not logged in' });
    next();
  });
  api.use(limit({ name: 'api', max: 300, windowMs: 60_000, by: 'user', trustHops }));
  api.param('guildId', (req, res, next, id) => (SNOWFLAKE.test(id) ? next() : res.status(400).json({ error: 'Bad server id' })));

  const lookupLimit = limit({ name: 'lookup', max: 40, windowMs: 60_000, by: 'user', trustHops });

  api.get('/me', limit({ name: 'me', max: 20, windowMs: 60_000, by: 'user', trustHops }), wrap(async (req, res) => {
    const guilds = await Promise.all([...client.guilds.cache.values()].map(async (g) => {
      if (!(await isMember(g.id, req.user.id))) return null;
      const player = client.lavalink.getPlayer(g.id);
      return {
        id: g.id,
        name: g.name,
        icon: g.iconURL({ size: 128, extension: 'png' }),
        inVoice: userVoiceChannel(g, req.user.id) !== null,
        nowPlaying: player?.queue.current && canSee(g.id, req.user.id) ? { title: player.queue.current.info.title, artwork: player.queue.current.info.artworkUrl ?? null } : null,
      };
    }));
    res.json({ user: req.user, guilds: guilds.filter(Boolean) });
  }));

  const guildRoute = (handler) => wrap(async (req, res) => {
    const { guildId } = req.params;
    if (!(await isMember(guildId, req.user.id))) throw new ControlError('Not a member of that server.', 403);
    await handler(req, res, client.guilds.cache.get(guildId));
  });

  /** Like guildRoute, but also requires being in the bot's voice channel when something is playing. */
  const playbackRoute = (handler) => guildRoute(async (req, res, guild) => {
    if (!canSee(req.params.guildId, req.user.id)) throw new ControlError("Join the bot's voice channel to see this.", 403);
    await handler(req, res, guild);
  });

  api.get('/guilds/:guildId/state', limit({ name: 'state', max: 60, windowMs: 60_000, by: 'user', trustHops }), guildRoute(async (req, res) => {
    const c = guildCore(req.params.guildId);
    const visible = canSee(req.params.guildId, req.user.id);
    res.json({
      state: { ...(visible ? c.core : c.hidden), me: meFor(req.params.guildId, req.user.id) },
      position: visible ? c.position : 0,
      ts: Date.now(),
    });
  }));

  // Queue and history are paged on demand so a huge queue never rides along with the live updates.
  const listLimit = limit({ name: 'lists', max: 240, windowMs: 60_000, by: 'user', trustHops });

  api.get('/guilds/:guildId/:kind(queue|history)', listLimit, playbackRoute(async (req, res) => {
    const player = client.lavalink.getPlayer(req.params.guildId);
    res.json(serializePage(player, req.params.kind, Number(req.query.offset), Number(req.query.limit)));
  }));

  api.get('/guilds/:guildId/queued', listLimit, playbackRoute(async (req, res) => {
    const ids = String(req.query.ids ?? '').split(',').filter(Boolean);
    if (ids.length > 50 || ids.some((id) => !/^[\w-]{1,64}$/.test(id))) throw new ControlError('Bad ids');
    res.json({ ids: queuedIds(client.lavalink.getPlayer(req.params.guildId), ids) });
  }));

  api.post('/guilds/:guildId/:action', limit({ name: 'control', max: 40, windowMs: 10_000, by: 'user', trustHops }), guildRoute(async (req, res, guild) => {
    const { action } = req.params;
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    // Adding hits Lavalink and can load whole albums, so it gets a tighter budget.
    if (action === 'add' && !consume(`add:${req.user.id}`, 15, 60_000).ok) throw new ControlError('You are adding songs too fast. Slow down a bit.', 429);
    await perform(client, guild, req.user, action, body);
    res.json({ ok: true });
    tick(true);
  }));

  api.get('/lyrics', lookupLimit, wrap(async (req, res) => {
    const { title, artist, duration } = req.query;
    if (typeof title !== 'string' || !title || title.length > 200) throw new ControlError('Bad title');
    if (artist !== undefined && (typeof artist !== 'string' || artist.length > 200)) throw new ControlError('Bad artist');
    const ms = Math.min(Math.max(Number(duration) || 0, 0), 4 * 60 * 60 * 1000);
    res.json(await catalog.lyrics(title, artist ?? '', ms));
  }));

  api.get('/search', lookupLimit, wrap(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
    if (!q) return res.json({ tracks: [], albums: [], artists: [] });
    res.json(await catalog.search(q));
  }));

  api.get('/album/:id', lookupLimit, wrap(async (req, res) => {
    if (!/^\d{1,15}$/.test(req.params.id)) throw new ControlError('Bad id');
    res.json(await catalog.album(req.params.id));
  }));

  api.get('/artist/:id', lookupLimit, wrap(async (req, res) => {
    if (!/^\d{1,15}$/.test(req.params.id)) throw new ControlError('Bad id');
    res.json(await catalog.artist(req.params.id));
  }));

  api.get('/img', limit({ name: 'img', max: 90, windowMs: 60_000, by: 'user', trustHops }), wrap(async (req, res) => {
    const img = typeof req.query.u === 'string' ? await catalog.proxyImage(req.query.u) : null;
    if (!img) return res.status(404).end();
    res.setHeader('Content-Type', img.type);
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.end(img.buf);
  }));

  app.use('/api', api);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  if (existsSync(DIST)) {
    app.use(express.static(DIST, {
      index: false,
      maxAge: '1h',
      setHeaders: (res, path) => { if (path.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache'); },
    }));
    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(join(DIST, 'index.html'));
    });
  } else {
    app.get('/', (req, res) => res.send('Dashboard not built. Run `npm run build:web`, or use `npm run dev:web` for development.'));
  }

  // Malformed JSON, oversized bodies and anything unexpected end up here without leaking internals.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status >= 400 && err.status < 500 ? err.status : 500;
    if (status === 500) log.warn(`web: ${req.method} ${req.path}: ${err.message}`);
    res.status(status).json({ error: status === 500 ? 'Something went wrong.' : 'Bad request' });
  });

  // ── WebSocket live state ─────────────────────────────────────────────────
  const server = http.createServer(app);
  server.headersTimeout = 15_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 50;

  // Clients never send anything meaningful, so keep frames tiny.
  const wss = new WebSocketServer({ noServer: true, maxPayload: 256 });

  /** @type {Set<{ ws: import('ws').WebSocket, guildId: string, userId: string, lastKey: string, lastSent: number }>} */
  const subs = new Set();
  const socketsFor = (userId) => { let n = 0; for (const s of subs) if (s.userId === userId) n += 1; return n; };

  const reject = (socket, code, text) => {
    socket.write(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\n\r\n`);
    socket.destroy();
  };

  server.on('upgrade', async (req, socket, head) => {
    try {
      const ip = clientIp(req, trustHops);
      if (!consume(`ws:ip:${ip}`, 30, 60_000).ok) return reject(socket, 429, 'Too Many Requests');

      const url = new URL(req.url, baseUrl);
      const user = auth.getUser(req);
      const guildId = url.searchParams.get('guild');
      if (url.pathname !== '/ws' || req.headers.origin !== baseUrl) return reject(socket, 403, 'Forbidden');
      if (!user) return reject(socket, 401, 'Unauthorized');
      if (!guildId || !SNOWFLAKE.test(guildId) || !(await isMember(guildId, user.id))) return reject(socket, 403, 'Forbidden');
      if (!consume(`ws:user:${user.id}`, 30, 60_000).ok) return reject(socket, 429, 'Too Many Requests');
      if (socketsFor(user.id) >= MAX_SOCKETS_PER_USER) return reject(socket, 429, 'Too Many Requests');

      wss.handleUpgrade(req, socket, head, (ws) => {
        const sub = { ws, guildId, userId: user.id, lastKey: '', lastSent: 0 };
        subs.add(sub);
        ws.isAlive = true;
        ws.on('close', () => subs.delete(sub));
        ws.on('error', () => { subs.delete(sub); ws.terminate(); });
        ws.on('pong', () => { ws.isAlive = true; });
        ws.on('message', () => ws.close(1008, 'Read-only socket'));
        tick(true);
      });
    } catch {
      socket.destroy();
    }
  });

  function tick(force = false) {
    const now = Date.now();
    const cache = new Map();
    for (const sub of subs) {
      if (sub.ws.readyState !== 1) continue;
      if (sub.ws.bufferedAmount > 512 * 1024) { sub.ws.terminate(); continue; }
      const c = guildCore(sub.guildId, cache);
      if (!c) { sub.ws.close(1001, 'Server unavailable'); continue; }
      const me = JSON.stringify(meFor(sub.guildId, sub.userId));
      const visible = canSee(sub.guildId, sub.userId);
      const json = visible ? c.json : c.hiddenJson;
      const position = visible ? c.position : 0;
      const key = json + me;
      if (!force && key === sub.lastKey && now - sub.lastSent < RESYNC_MS) continue;
      sub.lastKey = key;
      sub.lastSent = now;
      // The core is already serialised; only the small per-viewer `me` block is added per socket.
      sub.ws.send(`{"type":"state","position":${position},"ts":${now},"state":${json.slice(0, -1)},"me":${me}}}`);
    }
  }

  setInterval(() => { if (subs.size) tick(); }, TICK_MS).unref();
  setInterval(() => {
    for (const { ws } of subs) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
  }, 30_000).unref();

  server.listen(port, () => log.info(`Dashboard listening on ${baseUrl} (port ${port})`));
  return server;
}
