import http from 'node:http';
import { URL } from 'node:url';
import { join, extname } from 'node:path';
import { promises as fs } from 'node:fs';
import { WebSocketServer, WebSocket } from 'ws';
import { sessionTracker } from './sessionTracker.js';
import { authManager } from './auth.js';
import { log } from '../utils/logger.js';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
};

/**
 * Format track object for JSON serialization.
 */
function serializeTrack(track) {
  if (!track?.info) return null;
  return {
    title: track.info.title,
    author: track.info.author,
    duration: track.info.duration,
    uri: track.info.uri,
    artworkUrl: track.info.artworkUrl || null,
    sourceName: track.info.sourceName || 'unknown',
    isStream: track.info.isStream || false,
    requester: track.requester ? {
      username: track.requester.username || track.requester.tag || 'Unknown',
      avatar: track.requester.displayAvatarURL ? track.requester.displayAvatarURL() : null,
    } : null,
  };
}

/**
 * Find which guild and voice channel a user is currently connected to across all guilds.
 */
export function findUserVoice(client, userId) {
  if (!userId) return null;
  for (const guild of client.guilds.cache.values()) {
    const vs = guild.voiceStates.cache.get(userId);
    if (vs?.channelId && vs.channel) {
      return {
        guild,
        guildId: guild.id,
        guildName: guild.name,
        channel: vs.channel,
        channelId: vs.channel.id,
        channelName: vs.channel.name,
      };
    }
  }
  return null;
}

/**
 * Get comprehensive state for a guild player.
 */
export function getGuildState(client, guildId, session = null) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return null;

  const player = client.lavalink.getPlayer(guildId);
  const botVoice = guild.members.me?.voice?.channel;

  // Active voice members (excluding bots)
  const voiceMembers = botVoice
    ? [...botVoice.members.values()]
        .filter(m => !m.user.bot)
        .map(m => ({
          id: m.id,
          username: m.user.username,
          displayName: m.displayName,
          avatar: m.user.displayAvatarURL(),
        }))
    : [];

  const userVoiceInfo = session?.user?.id ? findUserVoice(client, session.user.id) : null;
  const userVoice = userVoiceInfo ? {
    guildId: userVoiceInfo.guildId,
    guildName: userVoiceInfo.guildName,
    channelId: userVoiceInfo.channelId,
    channelName: userVoiceInfo.channelName,
    isInCurrentGuild: userVoiceInfo.guildId === guildId,
  } : null;

  const isConnected = !!player?.connected;
  const isPlaying = !!player?.playing;
  const isPaused = !!player?.paused;

  const current = player?.queue?.current ? serializeTrack(player.queue.current) : null;
  const queue = player?.queue?.tracks ? player.queue.tracks.map(serializeTrack) : [];
  const previous = player?.queue?.previous ? player.queue.previous.map(serializeTrack) : [];

  // Must belong to guild AND be on the same voice channel as the bot to control
  let canControl = false;
  let controlReason = '';

  if (authManager.isConfigured() && !session) {
    canControl = false;
    controlReason = 'Login with Discord to control playback.';
  } else if (!userVoiceInfo) {
    canControl = false;
    controlReason = 'You must be in a voice channel to control playback.';
  } else if (botVoice && userVoiceInfo.channelId !== botVoice.id) {
    canControl = false;
    controlReason = `Join #${botVoice.name} to control playback.`;
  } else {
    canControl = true;
  }

  return {
    guild: {
      id: guild.id,
      name: guild.name,
      icon: guild.iconURL() || null,
      memberCount: guild.memberCount,
    },
    voice: botVoice ? {
      id: botVoice.id,
      name: botVoice.name,
      members: voiceMembers,
    } : null,
    userVoice,
    player: (player && isConnected) ? {
      connected: isConnected,
      playing: isPlaying,
      paused: isPaused,
      volume: player.volume ?? 100,
      repeatMode: player.repeatMode || 'off',
      position: player.position || 0,
      ping: player.ping?.ws ?? -1,
      current: (isPlaying || isPaused) ? current : null,
      queue,
      previous,
    } : null,
    stats: sessionTracker.getRoomStats(guildId),
    auth: {
      required: authManager.isConfigured(),
      canControl,
      controlReason,
      user: session?.user || null,
    },
  };
}

/**
 * Execute a player control action.
 */
export async function handlePlayerAction(client, guildId, action, params = {}, session = null) {
  if (authManager.isConfigured() && (!session || !authManager.canAccessGuild(client, session, guildId))) {
    return { success: false, error: 'Unauthorized: You must login with Discord and belong to this server.' };
  }

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return { success: false, error: 'Server not found.' };

  const botVoice = guild.members.me?.voice?.channel;
  const userVoice = session?.user?.id ? findUserVoice(client, session.user.id) : null;

  // Strict check: You can only control player if you're on the same channel as the bot!
  if (!userVoice) {
    return {
      success: false,
      error: 'You are not in a voice channel! Please join a voice channel in Discord first.',
    };
  }

  if (action !== 'play' && action !== 'join') {
    if (!botVoice) {
      return { success: false, error: 'Rae is not connected to a voice channel.' };
    }
    if (userVoice.channelId !== botVoice.id) {
      return {
        success: false,
        error: `You must be in the same voice channel as Rae (#${botVoice.name}) to control playback.`,
      };
    }
  } else if (action === 'play') {
    // For 'play': If bot is already connected, user must be in the same channel!
    if (botVoice && userVoice.channelId !== botVoice.id) {
      return {
        success: false,
        error: `Rae is currently playing in #${botVoice.name}. You can only control or add songs if you're in #${botVoice.name}!`,
      };
    }
  }

  const player = client.lavalink.getPlayer(guildId);
  if (!player && action !== 'play' && action !== 'join') {
    return { success: false, error: 'No active player for this server.' };
  }

  try {
    switch (action) {
      case 'join': {
        let targetGuildId = guildId;
        let targetVc = null;

        if (session?.user?.id) {
          const userVoice = findUserVoice(client, session.user.id);
          if (!userVoice) {
            return {
              success: false,
              error: 'You are not in a voice channel! Please join a voice channel in Discord first so Rae can join you.',
            };
          }
          targetGuildId = userVoice.guildId;
          targetVc = userVoice.channel;
        } else {
          const targetGuild = client.guilds.cache.get(guildId);
          targetVc = targetGuild?.members.me?.voice?.channel
            || targetGuild?.channels.cache.find(c => c.isVoiceBased() && c.members.some(m => !m.user.bot));
        }

        if (!targetVc) {
          return {
            success: false,
            error: 'Please join a voice channel in Discord first so Rae can join you!',
          };
        }

        let activePlayer = client.lavalink.getPlayer(targetGuildId);
        if (!activePlayer) {
          activePlayer = await client.lavalink.createPlayer({
            guildId: targetGuildId,
            voiceChannelId: targetVc.id,
            selfDeaf: true,
            volume: 100,
          });
        } else {
          activePlayer.voiceChannelId = targetVc.id;
          activePlayer.options.voiceChannelId = targetVc.id;
        }
        await activePlayer.connect();

        return {
          success: true,
          guildId: targetGuildId,
          switchedGuild: targetGuildId !== guildId,
        };
      }

      case 'play': {
        const { query, source } = params;
        if (!query) return { success: false, error: 'Query is required.' };

        let targetGuildId = guildId;
        let targetGuild = client.guilds.cache.get(guildId);
        let targetVc = null;

        // If user is authenticated, find which voice channel the user is in across ALL bot guilds
        if (session?.user?.id) {
          const userVoice = findUserVoice(client, session.user.id);
          if (!userVoice) {
            return {
              success: false,
              error: 'You are not in a voice channel! Please join a voice channel in Discord first so Rae can join you.',
            };
          }

          // Strictly join the VC the user is in — never any other VC or other server!
          targetGuildId = userVoice.guildId;
          targetGuild = userVoice.guild;
          targetVc = userVoice.channel;
        } else {
          // If unauthenticated or OAuth not active
          if (!targetGuild) return { success: false, error: 'Server not found.' };
          targetVc = targetGuild.members.me?.voice?.channel
            || targetGuild.channels.cache.find(c => c.isVoiceBased() && c.members.some(m => !m.user.bot));

          if (!targetVc) {
            return {
              success: false,
              error: 'Please join a voice channel in Discord first so Rae can join you!',
            };
          }
        }

        let activePlayer = client.lavalink.getPlayer(targetGuildId);
        if (!activePlayer) {
          activePlayer = await client.lavalink.createPlayer({
            guildId: targetGuildId,
            voiceChannelId: targetVc.id,
            selfDeaf: true,
            volume: 100,
          });
          await activePlayer.connect();
        } else {
          // If player is disconnected or user is in another VC, move to user's VC
          if (!activePlayer.connected || activePlayer.voiceChannelId !== targetVc.id) {
            activePlayer.voiceChannelId = targetVc.id;
            activePlayer.options.voiceChannelId = targetVc.id;
            await activePlayer.connect();
          }
        }

        const isUrl = /^https?:\/\//i.test(query);
        const searchPrefix = source || process.env.DEFAULT_SEARCH_ENGINE || 'dzsearch';
        const formattedQuery = isUrl ? query : `${searchPrefix}:${query}`;

        const requester = session?.user ? {
          username: session.user.username,
          displayAvatarURL: () => session.user.avatar,
        } : client.user;

        const res = await activePlayer.search({ query: formattedQuery }, requester);
        if (!res || !res.tracks?.length) {
          return { success: false, error: 'No results found.' };
        }

        if (res.loadType === 'playlist') {
          await activePlayer.queue.add(res.tracks);
        } else {
          await activePlayer.queue.add(res.tracks[0]);
        }

        if (!activePlayer.playing && !activePlayer.paused) {
          await activePlayer.play();
        }
        return {
          success: true,
          count: res.tracks.length,
          guildId: targetGuildId,
          switchedGuild: targetGuildId !== guildId,
        };
      }

      case 'pause':
        if (!player.paused) await player.pause();
        return { success: true };

      case 'resume':
        if (player.paused) await player.resume();
        return { success: true };

      case 'skip':
        if (!player.queue.tracks.length) {
          try { await player.skip(0, false); } catch { await player.stopPlaying(true, false); }
        } else {
          await player.skip();
        }
        return { success: true };

      case 'stop':
        await player.stopPlaying(true, true);
        return { success: true };

      case 'previous': {
        if (!player.queue.previous?.length) {
          return { success: false, error: 'No previous tracks in history.' };
        }
        const prev = player.queue.previous[player.queue.previous.length - 1];
        player.queue.splice(0, 0, prev);
        await player.skip();
        return { success: true };
      }

      case 'seek': {
        const pos = Number(params.position);
        if (isNaN(pos) || pos < 0) return { success: false, error: 'Invalid position.' };
        await player.seek(pos);
        return { success: true };
      }

      case 'volume': {
        const vol = Math.max(1, Math.min(150, Number(params.volume)));
        if (isNaN(vol)) return { success: false, error: 'Invalid volume level.' };
        await player.setVolume(vol);
        return { success: true, volume: vol };
      }

      case 'shuffle':
        if (!player.queue.tracks.length) return { success: false, error: 'Queue is empty.' };
        player.queue.shuffle();
        return { success: true };

      case 'loop': {
        const mode = params.mode || 'off'; // 'off' | 'track' | 'queue'
        player.setRepeatMode(mode);
        return { success: true, mode };
      }

      case 'remove': {
        const index = Number(params.index);
        if (isNaN(index) || index < 0 || index >= player.queue.tracks.length) {
          return { success: false, error: 'Invalid track index.' };
        }
        player.queue.remove(index);
        return { success: true };
      }

      case 'clear':
        player.queue.clear();
        return { success: true };

      case 'disconnect':
        await player.destroy();
        return { success: true };

      default:
        return { success: false, error: `Unknown action: ${action}` };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Start the web server and WebSocket hub.
 */
export function startWebServer(client) {
  const PORT = parseInt(process.env.DASHBOARD_PORT || '3000', 10);
  const PUBLIC_DIR = join(process.cwd(), 'public');

  // Track connected WebSockets by guildId: Map<guildId, Set<{ ws: WebSocket, session: any }>>
  const socketsByGuild = new Map();

  function broadcastGuild(guildId, payload) {
    const clients = socketsByGuild.get(guildId);
    if (!clients || clients.size === 0) return;
    for (const item of clients) {
      if (item.ws.readyState === WebSocket.OPEN) {
        if (payload.type === 'STATE_UPDATE') {
          item.ws.send(JSON.stringify({
            type: 'STATE_UPDATE',
            data: getGuildState(client, guildId, item.session),
          }));
        } else {
          item.ws.send(JSON.stringify(payload));
        }
      }
    }
  }

  // Hook Lavalink event broadcasts
  client.lavalink.on('trackStart', (player, track) => {
    sessionTracker.recordTrackStart(player.guildId, track);
    broadcastGuild(player.guildId, { type: 'STATE_UPDATE' });
  });

  client.lavalink.on('trackEnd', (player) => {
    broadcastGuild(player.guildId, { type: 'STATE_UPDATE' });
  });

  client.lavalink.on('queueEnd', (player) => {
    broadcastGuild(player.guildId, { type: 'STATE_UPDATE' });
  });

  client.lavalink.on('playerUpdate', (player) => {
    sessionTracker.recordPosition(player.guildId, player.position || 0);
    broadcastGuild(player.guildId, {
      type: 'POSITION_UPDATE',
      data: {
        position: player.position || 0,
        ping: player.ping?.ws ?? -1,
      },
    });
  });

  client.lavalink.on('playerDestroy', (player) => {
    broadcastGuild(player.guildId, { type: 'STATE_UPDATE' });
  });

  client.lavalink.on('playerPaused', (player) => {
    broadcastGuild(player.guildId, { type: 'STATE_UPDATE' });
  });

  client.lavalink.on('playerResumed', (player) => {
    broadcastGuild(player.guildId, { type: 'STATE_UPDATE' });
  });

  // Hook Discord voiceStateUpdate to broadcast voice channel changes in real-time
  client.on('voiceStateUpdate', (oldState, newState) => {
    const memberId = newState.member?.id || oldState.member?.id;
    const gid = newState.guild?.id || oldState.guild?.id;

    // 1. If the bot's voice state changed:
    if (memberId === client.user.id) {
      if (gid) {
        broadcastGuild(gid, { type: 'STATE_UPDATE' });
      }
      return;
    }

    // 2. If a member joined/left the bot's current VC:
    const botVc = newState.guild?.members.me?.voice?.channel;
    if (botVc && (oldState.channelId === botVc.id || newState.channelId === botVc.id)) {
      if (gid) {
        broadcastGuild(gid, { type: 'STATE_UPDATE' });
      }
    }

    // 3. If an authenticated user joined/moved/left a voice channel across any guild:
    for (const [socketGuildId, socketSet] of socketsByGuild.entries()) {
      for (const item of socketSet) {
        if (item.session?.user?.id === memberId) {
          const userVoice = findUserVoice(client, memberId);
          if (item.ws.readyState === WebSocket.OPEN) {
            item.ws.send(JSON.stringify({
              type: 'USER_VOICE_UPDATE',
              data: userVoice ? {
                guildId: userVoice.guildId,
                guildName: userVoice.guildName,
                channelId: userVoice.channelId,
                channelName: userVoice.channelName,
              } : null,
            }));
            item.ws.send(JSON.stringify({
              type: 'STATE_UPDATE',
              data: getGuildState(client, socketGuildId, item.session),
            }));
          }
        }
      }
    }
  });

  // Create HTTP Server
  const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    // Set standard CORS headers
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    const session = authManager.getSessionFromRequest(req);

    // ── OAuth2 Endpoints ───────────────────────────────────────────────────

    // GET /api/auth/login?guildId=...
    if (pathname === '/api/auth/login') {
      if (!authManager.isConfigured()) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          error: 'Discord OAuth2 is not configured. Please set CLIENT_SECRET in .env.',
        }));
      }
      const targetGuild = parsedUrl.searchParams.get('guildId') || null;
      const authUrl = authManager.getAuthorizeUrl(req.headers.host, targetGuild);
      res.writeHead(302, { Location: authUrl });
      return res.end();
    }

    // GET /api/auth/callback
    if (pathname === '/api/auth/callback') {
      const code = parsedUrl.searchParams.get('code');
      const state = parsedUrl.searchParams.get('state');
      if (!code || !state) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end('<h3>Missing authorization code or state.</h3>');
      }

      try {
        const { sessionToken, targetGuildId } = await authManager.handleCallback(code, state, req.headers.host);
        res.setHeader('Set-Cookie', `rae_session=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`);
        const target = targetGuildId ? `/?guild=${targetGuildId}` : '/';
        res.writeHead(302, { Location: target });
        return res.end();
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(`<h3>Login Failed</h3><p>${err.message}</p><p><a href="/">Return to Dashboard</a></p>`);
      }
    }

    // GET /api/auth/me
    if (pathname === '/api/auth/me') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        configured: authManager.isConfigured(),
        authenticated: !!session,
        user: session?.user || null,
      }));
    }

    // POST /api/auth/logout
    if (pathname === '/api/auth/logout' && req.method === 'POST') {
      const cookieHeader = req.headers?.cookie;
      const match = cookieHeader?.match(/(?:^|;\s*)rae_session=([^;]+)/);
      if (match) authManager.destroySession(match[1]);

      res.setHeader('Set-Cookie', 'rae_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true }));
    }

    // ── REST API ───────────────────────────────────────────────────────────

    // GET /api/guilds
    if (pathname === '/api/guilds') {
      let recommendedGuildId = null;

      const guilds = [...client.guilds.cache.values()]
        .filter(g => {
          if (!authManager.isConfigured() || !session) return true;
          return authManager.canAccessGuild(client, session, g.id);
        })
        .map(g => {
          const player = client.lavalink.getPlayer(g.id);
          const botVoice = g.members.me?.voice?.channel;
          const userVoiceState = session?.user?.id ? g.voiceStates.cache.get(session.user.id) : null;
          const userInVoice = !!userVoiceState?.channelId;

          const isConnected = !!player?.connected;
          const isPlaying = !!player?.playing;

          // Priority 1 for recommended guild: user is in a voice channel here!
          if (userInVoice && !recommendedGuildId) {
            recommendedGuildId = g.id;
          }

          return {
            id: g.id,
            name: g.name,
            icon: g.iconURL() || null,
            memberCount: g.memberCount,
            hasPlayer: isConnected,
            isPlaying: isPlaying,
            trackTitle: player?.queue?.current?.info?.title || null,
            botVoice: botVoice ? { id: botVoice.id, name: botVoice.name } : null,
            userInVoice,
            userVoiceChannel: userVoiceState?.channel ? {
              id: userVoiceState.channel.id,
              name: userVoiceState.channel.name,
            } : null,
          };
        });

      if (!recommendedGuildId) {
        const playingGuild = guilds.find(g => g.isPlaying);
        if (playingGuild) recommendedGuildId = playingGuild.id;
      }
      if (!recommendedGuildId) {
        const connectedGuild = guilds.find(g => g.hasPlayer);
        if (connectedGuild) recommendedGuildId = connectedGuild.id;
      }
      if (!recommendedGuildId && guilds.length > 0) {
        recommendedGuildId = guilds[0].id;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        guilds,
        recommendedGuildId,
      }));
    }

    // GET /api/guild/:guildId/state
    const stateMatch = pathname.match(/^\/api\/guild\/([^\/]+)\/state$/);
    if (stateMatch) {
      const guildId = stateMatch[1];
      const state = getGuildState(client, guildId, session);
      if (!state) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Guild not found.' }));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(state));
    }

    // GET /api/search?q=...&source=...
    if (pathname === '/api/search') {
      const query = parsedUrl.searchParams.get('q');
      const source = parsedUrl.searchParams.get('source') || process.env.DEFAULT_SEARCH_ENGINE || 'dzsearch';
      if (!query) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Query parameter q is required.' }));
      }

      try {
        const isUrl = /^https?:\/\//i.test(query);
        const searchPrefix = isUrl ? query : `${source}:${query}`;
        const node = client.lavalink.nodeManager.leastUsedNodes()[0]
          || [...client.lavalink.nodeManager.nodes.values()][0];

        if (!node) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'No Lavalink node available.' }));
        }

        const resSearch = await node.search({ query: searchPrefix }, client.user);
        const tracks = (resSearch?.tracks || []).slice(0, 15).map(serializeTrack);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ tracks }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: err.message }));
      }
    }

    // GET /api/lyrics?title=...&artist=...&duration=...
    if (pathname === '/api/lyrics') {
      const title = parsedUrl.searchParams.get('title');
      const artist = parsedUrl.searchParams.get('artist') || '';
      const duration = parsedUrl.searchParams.get('duration') || '';

      if (!title) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Title parameter is required.' }));
      }

      const cleanTitle = title
        .replace(/\(Official (Video|Music Video|Audio)\)/gi, '')
        .replace(/\[(Official (Video|Music Video|Audio)|Lyrics)\]/gi, '')
        .replace(/\(feat\.[^)]+\)/gi, '')
        .trim();

      const cacheKey = `${cleanTitle}:::${artist}`.toLowerCase();
      if (global._raeLyricsCache?.has(cacheKey)) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(global._raeLyricsCache.get(cacheKey)));
      }

      if (!global._raeLyricsCache) global._raeLyricsCache = new Map();

      try {
        const getUrl = new URL('https://lrclib.net/api/get');
        getUrl.searchParams.set('track_name', cleanTitle);
        if (artist) getUrl.searchParams.set('artist_name', artist);
        if (duration) getUrl.searchParams.set('duration', String(Math.round(Number(duration) / 1000)));

        let lrcRes = await fetch(getUrl, {
          headers: { 'User-Agent': 'RaeMusicBot/1.0' },
          signal: AbortSignal.timeout(6000),
        });

        let data = null;
        if (lrcRes.ok) {
          data = await lrcRes.json();
        }

        if (!data?.syncedLyrics && !data?.plainLyrics) {
          const searchUrl = new URL('https://lrclib.net/api/search');
          searchUrl.searchParams.set('q', `${cleanTitle} ${artist}`.trim());
          const searchRes = await fetch(searchUrl, {
            headers: { 'User-Agent': 'RaeMusicBot/1.0' },
            signal: AbortSignal.timeout(6000),
          });
          if (searchRes.ok) {
            const list = await searchRes.json();
            data = list?.find(item => item.syncedLyrics || item.plainLyrics) || null;
          }
        }

        const payload = {
          syncedLyrics: data?.syncedLyrics || null,
          plainLyrics: data?.plainLyrics || null,
          trackName: data?.trackName || title,
          artistName: data?.artistName || artist,
        };

        global._raeLyricsCache.set(cacheKey, payload);
        if (global._raeLyricsCache.size > 100) {
          global._raeLyricsCache.delete(global._raeLyricsCache.keys().next().value);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(payload));
      } catch (err) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ syncedLyrics: null, plainLyrics: null, error: err.message }));
      }
    }

    // POST /api/guild/:guildId/control
    const controlMatch = pathname.match(/^\/api\/guild\/([^\/]+)\/control$/);
    if (controlMatch && req.method === 'POST') {
      const guildId = controlMatch[1];
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body || '{}');
          const result = await handlePlayerAction(client, guildId, payload.action, payload, session);
          const effectiveGid = result.guildId || guildId;
          if (result.success) {
            broadcastGuild(effectiveGid, {
              type: 'STATE_UPDATE',
              data: getGuildState(client, effectiveGid),
            });
          }
          res.writeHead(result.success ? 200 : (result.error?.includes('Unauthorized') ? 401 : 400), {
            'Content-Type': 'application/json',
          });
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON payload.' }));
        }
      });
      return;
    }

    // ── Static Files ───────────────────────────────────────────────────────
    try {
      let relativePath = pathname;
      if (relativePath === '/' || relativePath.startsWith('/room/') || relativePath.startsWith('/guild/')) {
        relativePath = '/index.html';
      }

      const filePath = join(PUBLIC_DIR, relativePath);
      if (!filePath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403);
        return res.end('Forbidden');
      }

      const data = await fs.readFile(filePath);
      const ext = extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    } catch {
      try {
        const indexData = await fs.readFile(join(PUBLIC_DIR, 'index.html'));
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(indexData);
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Rae Web Player Dashboard: Static files not yet built.');
      }
    }
  });

  // ── WebSocket Server ─────────────────────────────────────────────────────
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const wsSession = authManager.getSessionFromRequest(req);
    let guildId = parsedUrl.searchParams.get('guildId');

    // 1. If user in session is in a VC in ANY guild, always prioritize that guild!
    if (wsSession?.user?.id) {
      const userVoice = findUserVoice(client, wsSession.user.id);
      if (userVoice) {
        guildId = userVoice.guildId;
      }
    }

    if (!guildId) {
      // 2. Any guild actively playing music
      for (const [gid, player] of client.lavalink.players.entries()) {
        if (player.playing && client.guilds.cache.has(gid)) {
          guildId = gid;
          break;
        }
      }
    }

    if (!guildId) {
      // 3. Accessible guild if authenticated
      if (wsSession && authManager.isConfigured()) {
        for (const g of client.guilds.cache.values()) {
          if (authManager.canAccessGuild(client, wsSession, g.id)) {
            guildId = g.id;
            break;
          }
        }
      }
    }

    if (!guildId) {
      guildId = client.guilds.cache.firstKey();
    }

    if (!guildId || !client.guilds.cache.has(guildId)) {
      ws.send(JSON.stringify({ type: 'ERROR', error: 'Guild not found or invalid.' }));
      ws.close();
      return;
    }

    let currentGuildId = guildId;
    const clientEntry = { ws, session: wsSession };

    function attachToGuild(newGid) {
      if (socketsByGuild.has(currentGuildId)) {
        socketsByGuild.get(currentGuildId).delete(clientEntry);
        if (socketsByGuild.get(currentGuildId).size === 0) {
          socketsByGuild.delete(currentGuildId);
        }
      }
      currentGuildId = newGid;
      if (!socketsByGuild.has(currentGuildId)) {
        socketsByGuild.set(currentGuildId, new Set());
      }
      socketsByGuild.get(currentGuildId).add(clientEntry);

      ws.send(JSON.stringify({
        type: 'INIT_STATE',
        data: getGuildState(client, currentGuildId, wsSession),
      }));
    }

    attachToGuild(guildId);

    // Handle incoming client messages
    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        // Dynamic server switch without reconnecting WS
        if (msg.action === 'switch_guild' && msg.guildId) {
          if (client.guilds.cache.has(msg.guildId)) {
            attachToGuild(msg.guildId);
          } else {
            ws.send(JSON.stringify({ type: 'ERROR', error: 'Selected server does not exist.' }));
          }
          return;
        }

        if (msg.action) {
          const res = await handlePlayerAction(client, currentGuildId, msg.action, msg, wsSession);
          if (res.success) {
            const effectiveGid = res.guildId || currentGuildId;
            if (res.switchedGuild) {
              attachToGuild(effectiveGid);
              ws.send(JSON.stringify({
                type: 'FORCE_SWITCH_GUILD',
                guildId: effectiveGid,
              }));
            }
            broadcastGuild(effectiveGid, {
              type: 'STATE_UPDATE',
              data: getGuildState(client, effectiveGid),
            });
          } else {
            ws.send(JSON.stringify({ type: 'ERROR', error: res.error }));
          }
        }
      } catch (err) {
        ws.send(JSON.stringify({ type: 'ERROR', error: 'Invalid WebSocket message format.' }));
      }
    });

    ws.on('close', () => {
      const set = socketsByGuild.get(currentGuildId);
      if (set) {
        set.delete(clientEntry);
        if (set.size === 0) socketsByGuild.delete(currentGuildId);
      }
    });
  });

  server.listen(PORT, () => {
    log.info(`[Web] Dashboard running at http://localhost:${PORT}`);
  });

  return server;
}
