/**
 * Small in-memory fixed-window rate limiter. No dependency and no storage; counters
 * reset on restart, which is fine for abuse protection.
 */

const MAX_KEYS = 50_000;

/** @type {Map<string, { count: number, reset: number }>} */
const buckets = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, b] of buckets) if (b.reset <= now) buckets.delete(key);
}, 60_000).unref();

/**
 * Count one hit against `key`. Returns { ok, retryAfter } where retryAfter is in seconds.
 */
export function consume(key, max, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.reset <= now) {
    if (!b && buckets.size >= MAX_KEYS) {
      // Under a key-flood, shed the oldest entries instead of growing without bound.
      for (const k of buckets.keys()) {
        buckets.delete(k);
        if (buckets.size < MAX_KEYS * 0.9) break;
      }
    }
    b = { count: 0, reset: now + windowMs };
    buckets.set(key, b);
  }
  b.count += 1;
  return { ok: b.count <= max, retryAfter: Math.max(1, Math.ceil((b.reset - now) / 1000)) };
}

/**
 * Client IP. Only trusts X-Forwarded-For when TRUST_PROXY (number of proxy hops) is set;
 * otherwise a client could spoof its address and dodge the limits.
 */
export function clientIp(req, trustHops) {
  const direct = req.socket?.remoteAddress ?? 'unknown';
  if (!trustHops) return direct;
  const hops = String(req.headers['x-forwarded-for'] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return hops[hops.length - trustHops] ?? direct;
}

/**
 * Express middleware. `by` picks the key: 'ip' or 'user' (needs req.user, falls back to IP).
 */
export function limit({ name, max, windowMs, by = 'ip', trustHops = 0 }) {
  return (req, res, next) => {
    const who = by === 'user' && req.user ? `u:${req.user.id}` : `ip:${clientIp(req, trustHops)}`;
    const { ok, retryAfter } = consume(`${name}:${who}`, max, windowMs);
    if (ok) return next();
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).json({ error: `Too many requests. Try again in ${retryAfter}s.` });
  };
}
