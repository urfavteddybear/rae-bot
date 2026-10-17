const DEFAULT_BASE = 'https://lrclib.net/api';

/**
 * Base URL of the lrclib API. Set LRCLIB_URL to send lyrics lookups to your own server or proxy;
 * the endpoints (/get, /search) stay the same. Include the /api part.
 */
export const lrclibBase = () => (process.env.LRCLIB_URL?.trim() || DEFAULT_BASE).replace(/\/+$/, '');
