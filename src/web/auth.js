import crypto from 'node:crypto';
import { log } from '../utils/logger.js';

class AuthManager {
  constructor() {
    /** @type {Map<string, { user: any, guilds?: Set<string>, expiresAt: number }>} */
    this.sessions = new Map();
    /** @type {Map<string, { guildId?: string, expiresAt: number }>} */
    this.oauthStates = new Map();

    // Clean up expired sessions every 15 minutes
    setInterval(() => this.cleanup(), 15 * 60 * 1000).unref();
  }

  cleanup() {
    const now = Date.now();
    for (const [token, session] of this.sessions.entries()) {
      if (session.expiresAt < now) this.sessions.delete(token);
    }
    for (const [state, data] of this.oauthStates.entries()) {
      if (data.expiresAt < now) this.oauthStates.delete(state);
    }
  }

  /**
   * Check if OAuth2 is configured in environment.
   */
  isConfigured() {
    return !!(process.env.CLIENT_ID && process.env.CLIENT_SECRET);
  }

  /**
   * Get the configured OAuth2 redirect URI.
   */
  getRedirectUri(hostHeader) {
    if (process.env.DASHBOARD_URL) {
      return `${process.env.DASHBOARD_URL.replace(/\/+$/, '')}/api/auth/callback`;
    }
    const protocol = hostHeader?.includes('localhost') ? 'http' : 'https';
    return `${protocol}://${hostHeader || 'localhost:3000'}/api/auth/callback`;
  }

  /**
   * Generate Discord OAuth2 Authorization URL.
   */
  getAuthorizeUrl(hostHeader, guildId = null) {
    const state = crypto.randomBytes(16).toString('hex');
    this.oauthStates.set(state, {
      guildId,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    });

    const redirectUri = this.getRedirectUri(hostHeader);
    const params = new URLSearchParams({
      client_id: process.env.CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'identify guilds',
      state,
      prompt: 'consent',
    });

    return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
  }

  /**
   * Exchange OAuth2 code for Discord user profile and guilds.
   */
  async handleCallback(code, state, hostHeader) {
    const stateData = this.oauthStates.get(state);
    if (!stateData) {
      throw new Error('Invalid or expired OAuth2 state. Please try logging in again.');
    }
    this.oauthStates.delete(state);

    const redirectUri = this.getRedirectUri(hostHeader);

    // 1. Exchange code for access token
    const tokenRes = await fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      log.error(`OAuth2 token exchange failed: ${errText}`);
      throw new Error('Failed to exchange authorization code with Discord.');
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // 2. Fetch User Profile (@me)
    const userRes = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userRes.ok) {
      throw new Error('Failed to fetch Discord user profile.');
    }

    const discordUser = await userRes.json();

    // 3. Fetch User Guilds (@me/guilds)
    let userGuilds = new Set();
    try {
      const guildsRes = await fetch('https://discord.com/api/v10/users/@me/guilds', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (guildsRes.ok) {
        const guildsData = await guildsRes.json();
        userGuilds = new Set(guildsData.map(g => g.id));
      }
    } catch {
      // Non-fatal if guilds fetch fails
    }

    // 4. Create local session (valid for 7 days)
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const avatarUrl = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
      : `https://cdn.discordapp.com/embed/avatars/${(BigInt(discordUser.id) >> 22n) % 6n}.png`;

    const session = {
      user: {
        id: discordUser.id,
        username: discordUser.username,
        discriminator: discordUser.discriminator,
        globalName: discordUser.global_name || discordUser.username,
        avatar: avatarUrl,
      },
      guilds: userGuilds,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    };

    this.sessions.set(sessionToken, session);

    return {
      sessionToken,
      session,
      targetGuildId: stateData.guildId,
    };
  }

  /**
   * Extract session from Request headers (Cookie or Authorization Bearer).
   */
  getSessionFromRequest(req) {
    let token = null;

    // Check Cookie header
    const cookieHeader = req.headers?.cookie;
    if (cookieHeader) {
      const match = cookieHeader.match(/(?:^|;\s*)rae_session=([^;]+)/);
      if (match) token = match[1];
    }

    // Check Authorization header fallback
    if (!token && req.headers?.authorization) {
      const parts = req.headers.authorization.split(' ');
      if (parts[0] === 'Bearer' && parts[1]) token = parts[1];
    }

    // Check URL query parameter fallback (e.g. for WebSocket handshake)
    if (!token && req.url) {
      try {
        const u = new URL(req.url, 'http://localhost');
        token = u.searchParams.get('token');
      } catch {}
    }

    if (!token) return null;

    const session = this.sessions.get(token);
    if (!session) return null;

    if (session.expiresAt < Date.now()) {
      this.sessions.delete(token);
      return null;
    }

    return session;
  }

  /**
   * Verify if user is authorized to access / control a specific guild.
   */
  canAccessGuild(client, session, guildId) {
    if (!session) return false;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return false;

    // Check if user is cached in guild or in their OAuth guilds list
    if (session.guilds && session.guilds.has(guildId)) return true;
    if (guild.members.cache.has(session.user.id)) return true;

    return false;
  }

  /**
   * Invalidate a session.
   */
  destroySession(token) {
    if (token) this.sessions.delete(token);
  }
}

export const authManager = new AuthManager();
