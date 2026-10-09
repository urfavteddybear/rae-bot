import { ThemeEngine } from './theme.js';
import { LyricsEngine } from './lyrics.js';

const themeEngine = new ThemeEngine();
const lyricsEngine = new LyricsEngine({
  onSeek: (positionMs) => {
    if (!canUserControl()) {
      notifyControlBlocked('seek lyrics');
      return;
    }
    sendAction('seek', { position: positionMs });
  },
});

// ── State Management ───────────────────────────────────────────────────────
let state = {
  guildId: null,
  guilds: [],
  guild: null,
  voice: null,
  userVoice: null,
  player: null,
  stats: null,
  auth: null,
  user: null,
};

let ws = null;
let reconnectTimer = null;
let animFrameId = null;
let lastSyncTimestamp = performance.now();
let basePosition = 0;
let searchDebounceTimer = null;
let currentNavTab = 'home';
let searchFilter = 'all';
let lastSearchResults = [];

function syncPosition(pos) {
  basePosition = typeof pos === 'number' ? pos : 0;
  lastSyncTimestamp = performance.now();
  if (state.player) state.player.position = basePosition;
  updateScrubber(basePosition, state.player?.current?.duration || 0);
}

// Helper: Format milliseconds to "m:ss" or "h:mm:ss"
function formatTime(ms) {
  if (!ms || isNaN(ms) || ms < 0) return '00:00';
  const totalSec = Math.floor(ms / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const padSec = String(secs).padStart(2, '0');

  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${padSec}`;
  }
  return `${mins}:${padSec}`;
}

// Helper: Format duration for humans ("2 hr 48 min" or "45 min")
function formatHumanDuration(ms) {
  if (!ms) return '0 min';
  const totalMin = Math.floor(ms / 60000);
  const hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hrs > 0) return `${hrs} hr ${mins} min`;
  return `${mins} min`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Toast Notification System (Matching Sono Pill Notification) ─────────────
export function showToast(message, type = 'info', meta = null) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  if (meta && meta.action === 'queue') {
    toast.innerHTML = `
      <span class="toast-badge-check">✓</span>
      <span>Added to the queue: <strong style="color: #fff;">${escapeHtml(meta.title)}</strong> · <span style="color: var(--text-muted);">${escapeHtml(meta.artist)}</span></span>
    `;
  } else {
    toast.innerHTML = `<span>${message}</span>`;
  }

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ── Check Discord Authentication ───────────────────────────────────────────
async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      state.user = data.user;
      renderAuthUser(data);
    }
  } catch {}
}

function renderAuthUser(data) {
  const container = document.getElementById('authContainer');
  if (!container) return;

  if (data.authenticated && data.user) {
    container.innerHTML = `
      <div class="user-profile" id="userMenuBtn" title="Logged in as ${data.user.username} • Click to logout">
        <img class="user-avatar" src="${data.user.avatar}" alt="Avatar">
      </div>
    `;
    document.getElementById('userMenuBtn')?.addEventListener('click', async () => {
      if (confirm(`Logout from ${data.user.username}?`)) {
        await fetch('/api/auth/logout', { method: 'POST' });
        location.reload();
      }
    });
  } else {
    container.innerHTML = `
      <button class="auth-button" id="loginBtn">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028z"/></svg>
        Login
      </button>
    `;
    document.getElementById('loginBtn')?.addEventListener('click', () => {
      const g = state.guildId ? `?guildId=${state.guildId}` : '';
      location.href = `/api/auth/login${g}`;
    });
  }
}

// ── Control Permission Helpers ─────────────────────────────────────────────
export function canUserControl() {
  if (state.auth && typeof state.auth.canControl === 'boolean') {
    return state.auth.canControl;
  }
  if (state.voice) {
    return !!state.userVoice && state.userVoice.channelId === state.voice.id;
  }
  return !!state.userVoice;
}

export function notifyControlBlocked(actionName = 'control playback') {
  if (state.auth?.controlReason) {
    showToast(state.auth.controlReason, 'error');
    return;
  }
  if (!state.userVoice) {
    showToast('You must be in a voice channel in Discord to control playback!', 'error');
  } else if (state.voice && state.userVoice.channelId !== state.voice.id) {
    showToast(`Join #${state.voice.name} in Discord to ${actionName}!`, 'error');
  } else {
    showToast(`You cannot ${actionName} right now.`, 'error');
  }
}

// ── Auto-Detect Guild ──────────────────────────────────────────────────────
async function resolveActiveGuild() {
  try {
    const res = await fetch('/api/guilds');
    if (!res.ok) return;
    const data = await res.json();
    state.guilds = Array.isArray(data) ? data : (data.guilds || []);
    const recommended = !Array.isArray(data) ? data.recommendedGuildId : null;

    if (recommended && state.guilds.some(g => g.id === recommended)) {
      state.guildId = recommended;
    } else if (state.guilds.length > 0 && !state.guildId) {
      state.guildId = state.guilds[0].id;
    }
  } catch (err) {
    console.error('[Web Player] Failed to resolve active guild:', err);
  }
}

function renderVoiceRoomBadge() {
  const badge = document.getElementById('voiceRoomBadge');
  const text = document.getElementById('voiceRoomText');
  if (!badge || !text) return;

  if (state.voice) {
    badge.style.display = 'flex';
    const isUserWithBot = state.userVoice && state.userVoice.channelId === state.voice.id;
    if (isUserWithBot) {
      badge.className = 'voice-room-badge connected same-channel';
      text.textContent = `#${state.voice.name}`;
      badge.title = `Connected in #${state.voice.name} (${state.guild?.name || 'Server'}) • Full control enabled`;
    } else {
      badge.className = 'voice-room-badge connected different-channel';
      text.textContent = `#${state.voice.name}`;
      badge.title = `Rae is active in #${state.voice.name} (${state.guild?.name || 'Server'}) • Join #${state.voice.name} to control`;
    }
  } else if (state.userVoice) {
    badge.style.display = 'flex';
    badge.className = 'voice-room-badge';
    const chName = state.userVoice.channelName || 'voice';
    text.textContent = `#${chName}`;
    badge.title = `You are in #${chName} • Play any track to summon Rae!`;
  } else {
    badge.style.display = 'none';
  }
}

function switchGuild(newGuildId) {
  if (state.guildId === newGuildId) return;
  state.guildId = newGuildId;

  // Reset local player and lyrics state immediately
  state.player = null;
  state.voice = null;
  lyricsEngine.clear();
  renderHero();
  renderPlayerBar();
  renderVoiceBanner();
  renderVoiceRoomBadge();

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ action: 'switch_guild', guildId: newGuildId }));
  } else {
    connectWebSocket();
  }
}

// ── Voice Status Banner ────────────────────────────────────────────────────
function renderVoiceBanner() {
  const banner = document.getElementById('voiceStatusBanner');
  const text = document.getElementById('voiceStatusText');
  const membersStack = document.getElementById('voiceMembersStack');
  if (!banner || !text) return;

  // Case 1: Bot is connected to voice
  if (state.voice) {
    const isUserWithBot = state.userVoice && state.userVoice.channelId === state.voice.id;
    const memberCount = state.voice.members?.length || 0;

    if (isUserWithBot) {
      banner.className = 'voice-status-banner connected';
      text.innerHTML = `Connected to <strong>#${state.voice.name}</strong> <span style="color:#1ed760;font-weight:600;">(with you)</span> ${memberCount > 0 ? `· ${memberCount} listening` : ''}`;
    } else {
      banner.className = 'voice-status-banner';
      text.innerHTML = `🔒 Rae is playing in <strong>#${state.voice.name}</strong> · <span style="color:#f5a623;font-weight:600;">Join #${state.voice.name} in Discord to control playback</span>`;
    }

    if (membersStack) {
      const members = state.voice.members || [];
      membersStack.innerHTML = members.slice(0, 5).map(m => `
        <img class="voice-member-avatar" src="${m.avatar || ''}" title="${m.displayName || m.username}" alt="${m.username}">
      `).join('');
    }
    return;
  }

  // Case 2: Bot is not in voice, but user IS in a voice channel
  if (state.userVoice) {
    banner.className = 'voice-status-banner user-in-vc';
    const chName = state.userVoice.channelName || state.userVoice.name || 'voice';
    text.innerHTML = `You are in <strong>#${chName}</strong> · Rae will join you when you play any track`;
    if (membersStack) membersStack.innerHTML = '';
    return;
  }

  // Case 3: Neither bot nor user is in voice
  banner.className = 'voice-status-banner';
  text.innerHTML = `You are not in a voice channel · <span style="color: var(--text-muted);">Join a voice channel in Discord to play</span>`;
  if (membersStack) membersStack.innerHTML = '';
}


// ── WebSocket Connection ───────────────────────────────────────────────────
function connectWebSocket() {
  if (ws) {
    try { ws.close(); } catch {}
  }

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${location.host}/ws${state.guildId ? `?guildId=${state.guildId}` : ''}`;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    if (reconnectTimer) clearTimeout(reconnectTimer);
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'INIT_STATE' || msg.type === 'STATE_UPDATE') {
        updateState(msg.data);
      } else if (msg.type === 'POSITION_UPDATE') {
        if (state.player && msg.data) {
          syncPosition(msg.data.position);
        }
      } else if (msg.type === 'USER_VOICE_UPDATE') {
        state.userVoice = msg.data;
        if (msg.data?.guildId && msg.data.guildId !== state.guildId) {
          switchGuild(msg.data.guildId);
        } else {
          renderVoiceBanner();
          renderVoiceRoomBadge();
          renderPlayerBar();
        }
      } else if (msg.type === 'FORCE_SWITCH_GUILD') {
        if (msg.guildId && msg.guildId !== state.guildId) {
          switchGuild(msg.guildId);
        }
      } else if (msg.type === 'ERROR') {
        showToast(msg.error, 'error');
        console.warn('[Web Player]', msg.error);
      }
    } catch (err) {
      console.error('[Web Player] WS parse error:', err);
    }
  };

  ws.onclose = () => {
    reconnectTimer = setTimeout(connectWebSocket, 2500);
  };
}

function sendAction(action, params = {}) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    showToast('Connecting to bot server...', 'info');
    return;
  }
  ws.send(JSON.stringify({ action, ...params }));
}

// ── State Renderer ─────────────────────────────────────────────────────────
function updateState(data) {
  if (!data) return;
  state.guild = data.guild;
  state.voice = data.voice;
  state.userVoice = data.userVoice;
  state.player = data.player;
  state.stats = data.stats;
  state.auth = data.auth;

  if (data.guild?.id && data.guild.id !== state.guildId) {
    state.guildId = data.guild.id;
  }

  if (typeof data.player?.position === 'number') {
    syncPosition(data.player.position);
  }

  renderVoiceRoomBadge();
  renderVoiceBanner();
  renderHero();
  renderStats();
  renderQueue();
  renderRecentlyPlayed();
  renderPlayerBar();
  updateViewVisibility();

  if (currentNavTab === 'search' && lastSearchResults.length > 0) {
    renderSearchResults(lastSearchResults);
  }

  // Dynamic ambient background transition
  const artUrl = data.player?.current?.artworkUrl;
  if (artUrl) {
    themeEngine.updateFromArtwork(artUrl);
  }

  // Synced lyrics loading (only when player is active and has a track)
  const isPlaybackActive = data.player?.current && (data.player.playing || data.player.paused);
  if (isPlaybackActive) {
    lyricsEngine.loadTrackLyrics(
      data.player.current.title,
      data.player.current.author,
      data.player.current.duration
    );
  } else {
    lyricsEngine.clear();
  }
}

// ── Render Hero Section ────────────────────────────────────────────────────
function renderHero() {
  const current = state.player?.current;
  const isPlaying = state.player?.playing && !state.player?.paused;
  const isPaused = state.player?.paused;
  const hasActiveTrack = current && (isPlaying || isPaused);

  const heroArt = document.getElementById('heroArt');
  const heroTitle = document.getElementById('heroTitle');
  const heroSubtitle = document.getElementById('heroSubtitle');
  const heroRequesterRow = document.getElementById('heroRequesterRow');
  const heroRequesterAvatar = document.getElementById('heroRequesterAvatar');
  const heroRequesterName = document.getElementById('heroRequesterName');
  const heroQuote = document.getElementById('heroQuote');

  if (hasActiveTrack) {
    heroArt.src = current.artworkUrl || '';
    heroTitle.textContent = current.title || 'Unknown Title';
    heroSubtitle.textContent = `${current.author || 'Unknown Artist'} · ${formatTime(current.duration)}`;

    if (current.requester) {
      heroRequesterRow.style.display = 'flex';
      heroRequesterAvatar.src = current.requester.avatar || '';
      heroRequesterName.textContent = `Queued by ${current.requester.username}`;
    } else {
      heroRequesterRow.style.display = 'none';
    }

    heroQuote.textContent = isPaused ? '⏸ Playback paused' : `Listening now via ${current.sourceName || 'music'}`;
  } else {
    heroArt.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='170' height='170'%3E%3Crect width='170' height='170' fill='%231a1a24'/%3E%3C/svg%3E";
    heroTitle.textContent = 'Nothing Playing';
    heroSubtitle.textContent = state.voice
      ? `Connected to #${state.voice.name}`
      : (state.guild ? `${state.guild.name} · Join a voice channel to start` : 'Connect to a voice channel and play a song');
    heroRequesterRow.style.display = 'none';
    heroQuote.textContent = 'Waiting for playback...';
  }
}

// ── Render "In the room" Stats ─────────────────────────────────────────────
function renderStats() {
  const stats = state.stats;
  const statTracksPlayed = document.getElementById('statTracksPlayed');
  const statListeningTime = document.getElementById('statListeningTime');
  const statTopArtist = document.getElementById('statTopArtist');
  const statTopArtistLabel = document.getElementById('statTopArtistLabel');

  if (!stats) return;

  statTracksPlayed.textContent = stats.tracksPlayed || 0;
  statListeningTime.textContent = formatHumanDuration(stats.listeningTimeMs || 0);

  if (stats.topArtist) {
    statTopArtist.textContent = stats.topArtist.name;
    statTopArtistLabel.textContent = `Most played · ${stats.topArtist.count} track${stats.topArtist.count === 1 ? '' : 's'}`;
  } else {
    statTopArtist.textContent = '—';
    statTopArtistLabel.textContent = 'Most played';
  }
}

// ── Render Queue ───────────────────────────────────────────────────────────
function renderQueue() {
  const queue = state.player?.queue || [];
  const queueMeta = document.getElementById('queueMeta');
  const queueList = document.getElementById('queueList');

  const totalDuration = queue.reduce((acc, t) => acc + (t.duration || 0), 0);
  queueMeta.textContent = `${queue.length} song${queue.length === 1 ? '' : 's'} · ${formatTime(totalDuration)}`;

  if (queue.length === 0) {
    queueList.innerHTML = `<p class="empty-state">Nothing queued. Search for a song here, or use /play in Discord.</p>`;
    return;
  }

  queueList.innerHTML = queue.slice(0, 10).map((t, index) => `
    <div class="track-row" data-index="${index}">
      <div class="track-row-left">
        <img class="track-row-art" src="${t.artworkUrl || ''}" alt="Cover">
        <div class="track-row-details">
          <span class="track-row-title">${t.title}</span>
          <span class="track-row-artist">${t.author} ${t.requester ? `· Added by ${t.requester.username}` : ''}</span>
        </div>
      </div>
      <span class="track-row-duration">${formatTime(t.duration)}</span>
    </div>
  `).join('');
}

// ── Render Recently Played ─────────────────────────────────────────────────
function renderRecentlyPlayed() {
  const recentlyPlayed = state.stats?.recentlyPlayed || state.player?.previous || [];
  const recentlyPlayedList = document.getElementById('recentlyPlayedList');

  if (recentlyPlayed.length === 0) {
    recentlyPlayedList.innerHTML = `<p class="empty-state">No recently played tracks yet.</p>`;
    return;
  }

  recentlyPlayedList.innerHTML = recentlyPlayed.slice(0, 8).map(t => `
    <div class="track-row" data-uri="${t.uri || ''}">
      <div class="track-row-left">
        <img class="track-row-art" src="${t.artworkUrl || ''}" alt="Cover">
        <div class="track-row-details">
          <span class="track-row-title">${t.title}</span>
          <span class="track-row-artist">${t.author}</span>
        </div>
      </div>
      <span class="track-row-duration">${formatTime(t.duration)}</span>
    </div>
  `).join('');

  recentlyPlayedList.querySelectorAll('.track-row').forEach(row => {
    row.addEventListener('click', () => {
      const uri = row.getAttribute('data-uri');
      if (uri) {
        if (!canUserControl()) {
          notifyControlBlocked('play tracks');
          return;
        }
        showToast('Adding track to queue...', 'info');
        sendAction('play', { query: uri });
      }
    });
  });
}

// ── Recent Searches State (Matching Sono) ──────────────────────────────────
let recentSearches = JSON.parse(localStorage.getItem('rae_recent_searches') || '[]');
if (!recentSearches.length) {
  recentSearches = ['galway girl', 'closer to you', 'adele', 'be kind', 'thinking out loud', 'coldplay', 'in my feelings', 'timeless'];
  localStorage.setItem('rae_recent_searches', JSON.stringify(recentSearches));
}

let isLyricsPanelOpen = true;

function saveRecentSearch(query) {
  if (!query || !query.trim()) return;
  const q = query.trim();
  recentSearches = [q, ...recentSearches.filter(item => item.toLowerCase() !== q.toLowerCase())].slice(0, 10);
  localStorage.setItem('rae_recent_searches', JSON.stringify(recentSearches));
  renderRecentSearches();
}

function removeRecentSearch(query) {
  recentSearches = recentSearches.filter(item => item.toLowerCase() !== query.toLowerCase());
  localStorage.setItem('rae_recent_searches', JSON.stringify(recentSearches));
  renderRecentSearches();
}

function clearAllRecentSearches() {
  recentSearches = [];
  localStorage.removeItem('rae_recent_searches');
  renderRecentSearches();
}

function renderRecentSearches() {
  const list = document.getElementById('recentSearchesList');
  const dropdown = document.getElementById('recentSearchesDropdown');
  if (!list || !dropdown) return;

  if (!recentSearches.length) {
    list.innerHTML = `<div style="padding: 12px; color: var(--text-muted); font-size: 13px; text-align: center;">No recent searches</div>`;
    return;
  }

  list.innerHTML = recentSearches.map(term => `
    <div class="recent-item" data-term="${escapeHtml(term)}">
      <div class="recent-item-left">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <span>${escapeHtml(term)}</span>
      </div>
      <button class="recent-item-remove" data-remove="${escapeHtml(term)}" title="Remove">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  `).join('');

  list.querySelectorAll('.recent-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.recent-item-remove')) return;
      const term = item.getAttribute('data-term');
      if (term) {
        const input = document.getElementById('searchInput');
        if (input) {
          input.value = term;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        dropdown.style.display = 'none';
      }
    });
  });

  list.querySelectorAll('.recent-item-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const term = btn.getAttribute('data-remove');
      if (term) removeRecentSearch(term);
    });
  });
}

// ── View Visibility Management ─────────────────────────────────────────────
export function updateViewVisibility() {
  const viewBotNotInCall = document.getElementById('viewBotNotInCall');
  const viewNothingPlaying = document.getElementById('viewNothingPlaying');
  const viewSearch = document.getElementById('viewSearch');
  const viewPlayer = document.getElementById('viewPlayer');
  const lyricsPane = document.querySelector('.lyrics-pane');
  const mainContent = document.getElementById('mainContent');
  const playerBar = document.querySelector('.player-bar');

  const isBotInVoice = !!(state.voice && state.voice.id);
  const current = state.player?.current;
  const isPlaybackActive = !!(current && (state.player?.playing || state.player?.paused));
  const isSearching = currentNavTab === 'search' || (document.getElementById('searchInput')?.value.trim().length > 0);

  // 1. Searching state (Image 3 & Image 4)
  if (isSearching) {
    if (viewBotNotInCall) viewBotNotInCall.style.display = 'none';
    if (viewNothingPlaying) viewNothingPlaying.style.display = 'none';
    if (viewPlayer) viewPlayer.style.display = 'none';
    if (viewSearch) viewSearch.style.display = 'flex';

    if (isPlaybackActive && isLyricsPanelOpen) {
      // Image 4: side-by-side search results + wave lyrics
      if (mainContent) {
        mainContent.classList.remove('no-lyrics');
        mainContent.classList.remove('no-bar');
      }
      if (lyricsPane) lyricsPane.style.display = 'flex';
      if (playerBar) playerBar.classList.remove('bar-hidden');
      document.getElementById('btnMicLyrics')?.classList.add('active');
    } else {
      // Image 3: search spans full layout, lyrics hidden, player bar visible
      if (mainContent) {
        mainContent.classList.add('no-lyrics');
        mainContent.classList.remove('no-bar');
      }
      if (lyricsPane) lyricsPane.style.display = 'none';
      if (playerBar) playerBar.classList.remove('bar-hidden');
      document.getElementById('btnMicLyrics')?.classList.remove('active');
    }
    return;
  }

  // 2. Normal Home tab views
  if (viewSearch) viewSearch.style.display = 'none';

  // Case A: Bot is not in a call (Image 1)
  if (!isBotInVoice) {
    if (viewBotNotInCall) viewBotNotInCall.style.display = 'flex';
    if (viewNothingPlaying) viewNothingPlaying.style.display = 'none';
    if (viewPlayer) viewPlayer.style.display = 'none';
    if (lyricsPane) lyricsPane.style.display = 'none';
    if (mainContent) {
      mainContent.classList.add('no-lyrics');
      mainContent.classList.add('no-bar');
    }
    if (playerBar) playerBar.classList.add('bar-hidden');
    document.getElementById('btnMicLyrics')?.classList.remove('active');
    return;
  }

  // Case B: Bot is in a call, but nothing playing (Image 2)
  if (!isPlaybackActive) {
    if (viewBotNotInCall) viewBotNotInCall.style.display = 'none';
    if (viewNothingPlaying) viewNothingPlaying.style.display = 'flex';
    if (viewPlayer) viewPlayer.style.display = 'none';
    if (lyricsPane) lyricsPane.style.display = 'none';
    if (mainContent) {
      mainContent.classList.add('no-lyrics');
      mainContent.classList.remove('no-bar');
    }
    if (playerBar) playerBar.classList.remove('bar-hidden');
    document.getElementById('btnMicLyrics')?.classList.remove('active');
    return;
  }

  // Case C: Bot is in a call and music is playing
  if (viewBotNotInCall) viewBotNotInCall.style.display = 'none';
  if (viewNothingPlaying) viewNothingPlaying.style.display = 'none';
  if (viewPlayer) viewPlayer.style.display = 'flex';
  if (playerBar) playerBar.classList.remove('bar-hidden');

  if (isLyricsPanelOpen) {
    if (lyricsPane) lyricsPane.style.display = 'flex';
    if (mainContent) {
      mainContent.classList.remove('no-lyrics');
      mainContent.classList.remove('no-bar');
    }
    document.getElementById('btnMicLyrics')?.classList.add('active');
  } else {
    if (lyricsPane) lyricsPane.style.display = 'none';
    if (mainContent) {
      mainContent.classList.add('no-lyrics');
      mainContent.classList.remove('no-bar');
    }
    document.getElementById('btnMicLyrics')?.classList.remove('active');
  }
}

// ── Search Page Renderer (Matching Sono) ──────────────────────────────────
function renderSearchResults(tracks = []) {
  const searchSongsList = document.getElementById('searchSongsList');
  const searchCountBadge = document.getElementById('searchCountBadge');
  const searchTopCol = document.getElementById('searchTopCol');
  const topResultImg = document.getElementById('topResultImg');
  const topResultName = document.getElementById('topResultName');
  const topResultType = document.getElementById('topResultType');
  const searchTopCard = document.getElementById('searchTopCard');

  const searchArtistsSection = document.getElementById('searchArtistsSection');
  const searchArtistsStrip = document.getElementById('searchArtistsStrip');
  const artistsCountBadge = document.getElementById('artistsCountBadge');

  const searchAlbumsSection = document.getElementById('searchAlbumsSection');
  const searchAlbumsStrip = document.getElementById('searchAlbumsStrip');
  const albumsCountBadge = document.getElementById('albumsCountBadge');

  if (!searchSongsList) return;

  if (!tracks.length) {
    searchSongsList.innerHTML = `<p class="empty-state">No tracks found. Try a different search term.</p>`;
    if (searchTopCol) searchTopCol.style.display = 'none';
    if (searchArtistsSection) searchArtistsSection.style.display = 'none';
    if (searchAlbumsSection) searchAlbumsSection.style.display = 'none';
    if (searchCountBadge) searchCountBadge.textContent = '0 songs';
    return;
  }

  // Filter based on selected pill
  let filteredTracks = [...tracks];
  if (searchFilter === 'artists') {
    filteredTracks = tracks.filter((t, i, arr) => arr.findIndex(x => x.author === t.author) === i);
  }

  if (searchCountBadge) {
    searchCountBadge.textContent = `See all ${filteredTracks.length} >`;
  }

  // 1. Top Result Card (Image 3 & 4)
  const topTrack = filteredTracks[0];
  if (topTrack && searchTopCol) {
    searchTopCol.style.display = 'block';
    if (topResultImg) {
      topResultImg.src = topTrack.artworkUrl || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Crect width='140' height='140' fill='%231a1a24'/%3E%3C/svg%3E";
    }
    if (topResultName) {
      topResultName.textContent = topTrack.author || topTrack.title;
    }
    if (topResultType) {
      topResultType.textContent = 'Artist';
    }

    if (searchTopCard) {
      searchTopCard.onclick = () => {
        if (!canUserControl()) {
          notifyControlBlocked('play songs');
          return;
        }
        showToast('', 'queue', { action: 'queue', title: topTrack.title, artist: topTrack.author });
        sendAction('play', { query: topTrack.uri });
      };
    }
  }

  // 2. Songs List with In-Queue status and Queue button
  searchSongsList.innerHTML = filteredTracks.map((t) => {
    const isCurrent = state.player?.current && (state.player.current.uri === t.uri || state.player.current.title === t.title);
    const inQueue = state.player?.queue?.some(q => q.uri === t.uri || q.title === t.title);
    const isQueued = isCurrent || inQueue;

    return `
      <div class="search-song-row" data-uri="${t.uri}" data-title="${escapeHtml(t.title)}" data-author="${escapeHtml(t.author)}">
        <div class="song-row-left">
          <img class="song-row-art" src="${t.artworkUrl || ''}" alt="Cover">
          <div class="song-row-details">
            <div class="song-row-title-row">
              <span class="song-row-title">${escapeHtml(t.title)}</span>
              ${isQueued ? `
                <span class="in-queue-badge">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                  In queue
                </span>
              ` : ''}
            </div>
            <span class="song-row-artist">${escapeHtml(t.author)}</span>
          </div>
        </div>
        <div class="song-row-right">
          <span class="song-row-duration">${formatTime(t.duration)}</span>
          <button class="song-queue-btn ${isQueued ? 'queued' : ''}" data-action="queue" title="${isQueued ? 'In queue' : 'Add to queue'}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              ${isQueued ? '<polyline points="20 6 9 17 4 12"/>' : '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'}
            </svg>
          </button>
        </div>
      </div>
    `;
  }).join('');

  // Row and queue click handlers
  searchSongsList.querySelectorAll('.search-song-row').forEach(row => {
    const uri = row.getAttribute('data-uri');
    const title = row.getAttribute('data-title');
    const author = row.getAttribute('data-author');

    const handleQueue = () => {
      if (!uri) return;
      if (!canUserControl()) {
        notifyControlBlocked('play songs');
        return;
      }
      const btn = row.querySelector('.song-queue-btn');
      if (btn) {
        btn.classList.add('queued');
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="20 6 9 17 4 12"/></svg>';
      }
      showToast('', 'queue', { action: 'queue', title, artist: author });
      sendAction('play', { query: uri });
    };

    row.querySelector('.song-queue-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      handleQueue();
    });

    row.addEventListener('click', handleQueue);
  });

  // 3. Artists Carousel (Matching Sono)
  const uniqueArtists = [];
  const seenArtists = new Set();
  for (const t of tracks) {
    if (t.author && !seenArtists.has(t.author.toLowerCase())) {
      seenArtists.add(t.author.toLowerCase());
      uniqueArtists.push({ name: t.author, avatar: t.artworkUrl, uri: t.uri });
    }
  }

  if (searchArtistsSection && searchArtistsStrip) {
    if (uniqueArtists.length > 0 && searchFilter !== 'albums') {
      searchArtistsSection.style.display = 'block';
      if (artistsCountBadge) artistsCountBadge.textContent = `See all ${uniqueArtists.length} >`;

      searchArtistsStrip.innerHTML = uniqueArtists.slice(0, 8).map(a => `
        <div class="search-artist-card" data-artist="${escapeHtml(a.name)}" data-uri="${a.uri}">
          <img class="search-artist-avatar" src="${a.avatar || ''}" alt="${escapeHtml(a.name)}">
          <span class="search-artist-name">${escapeHtml(a.name)}</span>
          <span class="search-artist-sub">Artist</span>
        </div>
      `).join('');

      searchArtistsStrip.querySelectorAll('.search-artist-card').forEach(card => {
        card.addEventListener('click', () => {
          const artist = card.getAttribute('data-artist');
          const input = document.getElementById('searchInput');
          if (input && artist) {
            input.value = artist;
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
        });
      });
    } else {
      searchArtistsSection.style.display = 'none';
    }
  }

  // 4. Albums Carousel (Matching Sono)
  if (searchAlbumsSection && searchAlbumsStrip) {
    if (tracks.length > 0 && searchFilter !== 'artists') {
      searchAlbumsSection.style.display = 'block';
      if (albumsCountBadge) albumsCountBadge.textContent = `See all ${tracks.length} >`;

      searchAlbumsStrip.innerHTML = tracks.slice(0, 10).map(t => `
        <div class="search-album-card" data-uri="${t.uri}" data-title="${escapeHtml(t.title)}" data-author="${escapeHtml(t.author)}">
          <img class="search-album-cover" src="${t.artworkUrl || ''}" alt="${escapeHtml(t.title)}">
          <span class="search-album-title">${escapeHtml(t.title)}</span>
          <span class="search-album-sub">${escapeHtml(t.author)}</span>
        </div>
      `).join('');

      searchAlbumsStrip.querySelectorAll('.search-album-card').forEach(card => {
        card.addEventListener('click', () => {
          const uri = card.getAttribute('data-uri');
          const title = card.getAttribute('data-title');
          const author = card.getAttribute('data-author');
          if (!uri) return;
          if (!canUserControl()) {
            notifyControlBlocked('play albums');
            return;
          }
          showToast('', 'queue', { action: 'queue', title, artist: author });
          sendAction('play', { query: uri });
        });
      });
    } else {
      searchAlbumsSection.style.display = 'none';
    }
  }
}

// ── Render Bottom Bar ──────────────────────────────────────────────────────
function renderPlayerBar() {
  const current = state.player?.current;
  const isPlaying = state.player?.playing && !state.player?.paused;
  const isPaused = state.player?.paused;
  const hasActiveTrack = current && (isPlaying || isPaused);

  const playerBar = document.querySelector('.player-bar');
  if (playerBar) {
    const isLocked = !canUserControl();
    playerBar.classList.toggle('controls-locked', isLocked);
    playerBar.title = isLocked
      ? (state.auth?.controlReason || (state.voice ? `Join #${state.voice.name} to control playback` : 'Join a voice channel to control playback'))
      : '';
  }

  const barThumb = document.getElementById('barThumb');
  const barThumbRecord = document.getElementById('barThumbRecord');
  const barTitle = document.getElementById('barTitle');
  const barArtist = document.getElementById('barArtist');
  const playIcon = document.getElementById('playIcon');
  const pauseIcon = document.getElementById('pauseIcon');
  const timeTotal = document.getElementById('timeTotal');

  if (hasActiveTrack) {
    if (barThumb) {
      barThumb.src = current.artworkUrl || '';
      barThumb.style.display = 'block';
    }
    if (barThumbRecord) barThumbRecord.style.display = 'none';

    if (barTitle) barTitle.textContent = current.title;
    if (barArtist) barArtist.textContent = current.author;
    if (timeTotal) timeTotal.textContent = formatTime(current.duration);
  } else {
    // Nothing playing state (Images 2 & 3)
    if (barThumb) barThumb.style.display = 'none';
    if (barThumbRecord) barThumbRecord.style.display = 'flex';

    if (barTitle) barTitle.textContent = 'Nothing playing';
    if (barArtist) barArtist.textContent = 'Start a song in Discord';
    if (timeTotal) timeTotal.textContent = '--:--';
  }

  if (isPlaying) {
    if (playIcon) playIcon.style.display = 'none';
    if (pauseIcon) pauseIcon.style.display = 'block';
  } else {
    if (playIcon) playIcon.style.display = 'block';
    if (pauseIcon) pauseIcon.style.display = 'none';
  }

  // Volume bar
  const volume = state.player?.volume ?? 100;
  const volumeFill = document.getElementById('volumeFill');
  if (volumeFill) {
    volumeFill.style.width = `${Math.min(100, (volume / 150) * 100)}%`;
  }

  // Loop mode highlight
  const btnLoop = document.getElementById('btnLoop');
  if (btnLoop) {
    btnLoop.classList.toggle('active', state.player?.repeatMode !== 'off');
  }

  updateScrubber(hasActiveTrack ? (state.player?.position || 0) : 0, hasActiveTrack ? (current?.duration || 0) : 0);
}

let lastFormattedTime = '';
function updateScrubber(position, duration) {
  const timeCurrent = document.getElementById('timeCurrent');
  const scrubProgress = document.getElementById('scrubProgress');
  if (!timeCurrent || !scrubProgress) return;

  const formatted = formatTime(position);
  if (formatted !== lastFormattedTime) {
    lastFormattedTime = formatted;
    timeCurrent.textContent = formatted;
  }
  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
  scrubProgress.style.width = `${pct}%`;

  const isPlaying = state.player?.playing && !state.player?.paused;
  lyricsEngine.updatePosition(position, isPlaying);
}

// ── Ultra-Smooth 60/120fps Animation Loop (requestAnimationFrame) ───────────
function startAnimationTicker() {
  if (animFrameId) cancelAnimationFrame(animFrameId);

  function tick() {
    if (state.player?.playing && !state.player?.paused && state.player.current) {
      const now = performance.now();
      const elapsed = now - lastSyncTimestamp;
      const currentPos = Math.min(basePosition + elapsed, state.player.current.duration || Infinity);
      state.player.position = currentPos;
      updateScrubber(currentPos, state.player.current.duration || 0);
    }
    animFrameId = requestAnimationFrame(tick);
  }

  animFrameId = requestAnimationFrame(tick);
}

// ── Control Listeners ──────────────────────────────────────────────────────
function setupEventListeners() {
  // Bring the bot here (Image 1)
  document.getElementById('btnBringBot')?.addEventListener('click', () => {
    if (!state.userVoice) {
      showToast('Join a voice channel in Discord first so Rae can join you!', 'info');
      return;
    }
    showToast('Summoning Rae to your voice channel...', 'info');
    sendAction('join');
  });

  // Navigation Pills: Home & Profile
  const tabHome = document.getElementById('tabHome');
  const tabProfile = document.getElementById('tabProfile');
  const searchInput = document.getElementById('searchInput');
  const searchClearBtn = document.getElementById('searchClearBtn');
  const recentDropdown = document.getElementById('recentSearchesDropdown');

  tabHome?.addEventListener('click', () => {
    currentNavTab = 'home';
    tabHome.classList.add('active');
    tabProfile?.classList.remove('active');
    if (searchInput) searchInput.value = '';
    if (searchClearBtn) searchClearBtn.style.display = 'none';
    if (recentDropdown) recentDropdown.style.display = 'none';
    updateViewVisibility();
  });

  tabProfile?.addEventListener('click', () => {
    currentNavTab = 'profile';
    tabProfile.classList.add('active');
    tabHome?.classList.remove('active');
    if (recentDropdown) recentDropdown.style.display = 'none';
    showToast(state.user ? `Logged in as ${state.user.username}` : 'Log in with Discord in the top right!', 'info');
  });

  // Search Filter Pills (Image 3 & 4)
  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      searchFilter = pill.getAttribute('data-filter') || 'all';
      renderSearchResults(lastSearchResults);
    });
  });

  // Search Input with Debounce, Clear Button & Recent Searches Dropdown
  if (searchInput) {
    renderRecentSearches();

    searchInput.addEventListener('focus', () => {
      if (!searchInput.value.trim() && recentDropdown) {
        renderRecentSearches();
        recentDropdown.style.display = 'block';
      }
    });

    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.trim();
      if (searchClearBtn) {
        searchClearBtn.style.display = query ? 'flex' : 'none';
      }

      if (!query) {
        currentNavTab = 'home';
        tabHome?.classList.add('active');
        if (recentDropdown) {
          renderRecentSearches();
          recentDropdown.style.display = 'block';
        }
        updateViewVisibility();
        return;
      }

      if (recentDropdown) recentDropdown.style.display = 'none';
      currentNavTab = 'search';
      updateViewVisibility();

      if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(async () => {
        try {
          saveRecentSearch(query);
          const searchSongsList = document.getElementById('searchSongsList');
          if (searchSongsList) {
            searchSongsList.innerHTML = `<p class="empty-state">Searching for "${query}"...</p>`;
          }
          const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
          if (res.ok) {
            const data = await res.json();
            lastSearchResults = data.tracks || [];
            renderSearchResults(lastSearchResults);
          }
        } catch (err) {
          console.error('[Web Player] Search failed:', err);
        }
      }, 280);
    });

    searchClearBtn?.addEventListener('click', () => {
      searchInput.value = '';
      searchClearBtn.style.display = 'none';
      currentNavTab = 'home';
      tabHome?.classList.add('active');
      if (recentDropdown) recentDropdown.style.display = 'none';
      updateViewVisibility();
    });

    // Close recent searches dropdown on outside click
    document.addEventListener('click', (e) => {
      const wrap = document.getElementById('searchBoxWrap');
      if (wrap && !wrap.contains(e.target) && recentDropdown) {
        recentDropdown.style.display = 'none';
      }
    });

    document.getElementById('clearRecentBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      clearAllRecentSearches();
    });
  }

  // Play/Pause
  document.getElementById('btnPlayPause')?.addEventListener('click', () => {
    if (!canUserControl()) {
      notifyControlBlocked('control playback');
      return;
    }
    if (!state.player) {
      showToast('Join a voice channel and play a song to begin!', 'info');
      return;
    }
    if (state.player.paused) {
      sendAction('resume');
    } else {
      sendAction('pause');
    }
  });

  // Stop button
  document.getElementById('btnStop')?.addEventListener('click', () => {
    if (!canUserControl()) {
      notifyControlBlocked('stop playback');
      return;
    }
    sendAction('stop');
    showToast('Playback stopped', 'info');
  });

  // Next / Previous
  document.getElementById('btnNext')?.addEventListener('click', () => {
    if (!canUserControl()) {
      notifyControlBlocked('skip track');
      return;
    }
    sendAction('skip');
  });

  document.getElementById('btnPrevious')?.addEventListener('click', () => {
    if (!canUserControl()) {
      notifyControlBlocked('play previous track');
      return;
    }
    sendAction('previous');
  });

  // Shuffle
  document.getElementById('btnShuffle')?.addEventListener('click', () => {
    if (!canUserControl()) {
      notifyControlBlocked('shuffle queue');
      return;
    }
    sendAction('shuffle');
  });

  // Loop toggle
  document.getElementById('btnLoop')?.addEventListener('click', () => {
    if (!canUserControl()) {
      notifyControlBlocked('change loop mode');
      return;
    }
    const modes = ['off', 'track', 'queue'];
    const current = state.player?.repeatMode || 'off';
    const nextIdx = (modes.indexOf(current) + 1) % modes.length;
    sendAction('loop', { mode: modes[nextIdx] });
  });

  // Scrubber click/drag to seek
  const scrubTrack = document.getElementById('scrubTrack');
  if (scrubTrack) {
    scrubTrack.addEventListener('click', (e) => {
      if (!canUserControl()) {
        notifyControlBlocked('seek playback');
        return;
      }
      const duration = state.player?.current?.duration;
      if (!duration) return;
      const rect = scrubTrack.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const seekPos = Math.round(pct * duration);
      sendAction('seek', { position: seekPos });
    });
  }

  // Volume slider click
  const volumeSlider = document.getElementById('volumeSlider');
  if (volumeSlider) {
    volumeSlider.addEventListener('click', (e) => {
      if (!canUserControl()) {
        notifyControlBlocked('change volume');
        return;
      }
      const rect = volumeSlider.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const vol = Math.round(pct * 150);
      sendAction('volume', { volume: vol });
    });
  }

  // Lyrics toggle via Mic button in player bar (Matching Sono)
  document.getElementById('btnMicLyrics')?.addEventListener('click', () => {
    isLyricsPanelOpen = !isLyricsPanelOpen;
    updateViewVisibility();
  });

  // Fullscreen Expand / Compress lyrics
  const expandLyricsBtn = document.getElementById('expandLyricsBtn');
  expandLyricsBtn?.addEventListener('click', () => {
    const pane = document.getElementById('lyricsPane');
    if (!pane) return;
    const isFullscreen = pane.classList.toggle('fullscreen-lyrics');
    if (isFullscreen) {
      expandLyricsBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`;
      expandLyricsBtn.title = 'Compress lyrics';
    } else {
      expandLyricsBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`;
      expandLyricsBtn.title = 'Expand lyrics';
    }
  });

  document.getElementById('heroLyricsBtn')?.addEventListener('click', () => {
    isLyricsPanelOpen = true;
    updateViewVisibility();
    const pane = document.getElementById('lyricsPane');
    if (pane) pane.scrollIntoView({ behavior: 'smooth' });
  });

  // Source link & Open Album
  document.getElementById('trackSourceBtn')?.addEventListener('click', () => {
    if (state.player?.current?.uri) window.open(state.player.current.uri, '_blank');
  });
  document.getElementById('openAlbumBtn')?.addEventListener('click', () => {
    if (state.player?.current?.uri) window.open(state.player.current.uri, '_blank');
  });

  // Mute toggle
  let savedVolume = 100;
  document.getElementById('btnMute')?.addEventListener('click', () => {
    if (!canUserControl()) {
      notifyControlBlocked('adjust volume');
      return;
    }
    if ((state.player?.volume || 0) > 0) {
      savedVolume = state.player.volume;
      sendAction('volume', { volume: 0 });
    } else {
      sendAction('volume', { volume: savedVolume || 100 });
    }
  });

  // Fullscreen button
  document.getElementById('btnFullscreen')?.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });
}

// ── Bootstrapping ──────────────────────────────────────────────────────────
async function init() {
  await checkAuth();
  await resolveActiveGuild();
  connectWebSocket();
  setupEventListeners();
  startAnimationTicker();
}

init();

