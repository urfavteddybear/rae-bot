import crypto from 'crypto';
import { log } from '../utils/logger.js';

const DISCORD_API = 'https://discord.com/api/v10';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

/**
 * Stateless signed-cookie sessions: survives restarts without a database.
 * Only the Discord user identity is stored; guild access is re-checked live.
 * Logging out revokes the session id for the rest of the process lifetime.
 */
export function createAuth({ clientId, clientSecret, baseUrl, secret }) {
  const redirectUri = `${baseUrl}/auth/callback`;
  const secure = baseUrl.startsWith('https://');
  // __Host- cookies are pinned to this exact host and can't be set by sibling subdomains.
  const COOKIE = secure ? '__Host-rae_session' : 'rae_session';
  const STATE_COOKIE = secure ? '__Host-rae_oauth' : 'rae_oauth';

  /** @type {Map<string, number>} revoked session id -> expiry */
  const revoked = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [sid, exp] of revoked) if (exp <= now) revoked.delete(sid);
  }, 10 * 60_000).unref();

  const sign = (value) => crypto.createHmac('sha256', secret).update(value).digest('base64url');

  function encode(payload) {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${body}.${sign(body)}`;
  }

  function decode(token) {
    if (!token || token.length > 2048) return null;
    const [body, sig] = token.split('.');
    if (!body || !sig) return null;
    const expected = sign(body);
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    try {
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
      if (!(payload.exp > Date.now()) || revoked.has(payload.sid)) return null;
      return payload;
    } catch {
      return null;
    }
  }

  function parseCookies(header = '') {
    const out = {};
    for (const part of header.split(';')) {
      const i = part.indexOf('=');
      if (i <= 0) continue;
      try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* skip malformed cookie */ }
    }
    return out;
  }

  function setCookie(res, name, value, maxAgeMs) {
    const attrs = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${Math.floor(maxAgeMs / 1000)}`];
    if (secure) attrs.push('Secure');
    const prev = res.getHeader('Set-Cookie') ?? [];
    res.setHeader('Set-Cookie', [...(Array.isArray(prev) ? prev : [prev]), attrs.join('; ')]);
  }

  const readSession = (req) => decode(parseCookies(req.headers.cookie)[COOKIE]);

  /** Resolve the user for an Express/ws request, or null. */
  function getUser(req) {
    return readSession(req)?.user ?? null;
  }

  function login(req, res) {
    const state = crypto.randomBytes(16).toString('hex');
    setCookie(res, STATE_COOKIE, state, 10 * 60 * 1000);
    const url = new URL('https://discord.com/oauth2/authorize');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', 'identify');
    url.searchParams.set('state', state);
    url.searchParams.set('prompt', 'none');
    res.redirect(url.toString());
  }

  async function callback(req, res) {
    const { code, state, error } = req.query;
    if (error) return res.redirect('/');

    const expected = parseCookies(req.headers.cookie)[STATE_COOKIE];
    const valid = typeof code === 'string' && typeof state === 'string' && code.length <= 512
      && typeof expected === 'string' && state.length === expected.length
      && crypto.timingSafeEqual(Buffer.from(state), Buffer.from(expected));
    if (!valid) {
      log.warn(`web: rejected OAuth callback with bad state from ${req.ip}`);
      return res.status(400).send('Invalid login attempt. Go back and try logging in again.');
    }

    const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!tokenRes.ok) return res.status(502).send('Discord rejected the login. Check CLIENT_SECRET and the redirect URI.');
    const { access_token } = await tokenRes.json();

    const meRes = await fetch(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${access_token}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!meRes.ok) return res.status(502).send('Could not read your Discord profile.');
    const me = await meRes.json();
    if (!/^\d{15,22}$/.test(String(me.id))) return res.status(502).send('Unexpected response from Discord.');

    // The token was only needed to read the profile; drop it right away.
    fetch(`${DISCORD_API}/oauth2/token/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, token: access_token }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    }).catch(() => {});

    const user = {
      id: me.id,
      name: String(me.global_name ?? me.username ?? 'Unknown').slice(0, 64),
      avatar: me.avatar
        ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=128`
        : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(me.id) >> 22n) % 6n)}.png`,
    };
    const sid = crypto.randomBytes(16).toString('hex');
    setCookie(res, COOKIE, encode({ user, sid, exp: Date.now() + SESSION_TTL_MS }), SESSION_TTL_MS);
    setCookie(res, STATE_COOKIE, '', 0);
    res.redirect('/');
  }

  function logout(req, res) {
    const session = readSession(req);
    if (session) revoked.set(session.sid, session.exp);
    setCookie(res, COOKIE, '', 0);
    res.json({ ok: true });
  }

  return { getUser, login, callback, logout };
}
