/**
 * Shared message building for the bot. Every message is a Components V2 message: a plain container
 * (no colour stripe) holding text, with buttons underneath when a command needs them.
 */
import {
  ContainerBuilder, MessageFlags, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder,
  ThumbnailBuilder,
} from 'discord.js';

// ── Message builders ───────────────────────────────────────────────────────

const text = (content) => new TextDisplayBuilder().setContent(content);

/** A container holding the given parts: strings become text, anything else is added as is. */
export function box(...parts) {
  const container = new ContainerBuilder();
  for (const part of parts.flat().filter(Boolean)) {
    if (typeof part === 'string') container.addTextDisplayComponents(text(part));
    else if (part instanceof SectionBuilder) container.addSectionComponents(part);
    else if (part instanceof SeparatorBuilder) container.addSeparatorComponents(part);
    else container.addTextDisplayComponents(part);
  }
  return container;
}

/** Smallest text Discord has: every non-empty line becomes subtext. */
export const small = (content) => String(content).split('\n').map((line) => (line.trim() ? `-# ${line}` : line)).join('\n');

/** A thin divider between parts of a box. */
export const divider = () => new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);

/** Text on the left with a picture on the right. Falls back to plain text when there is no picture. */
export function withPicture(content, url) {
  if (!url) return text(content);
  return new SectionBuilder().addTextDisplayComponents(text(content)).setThumbnailAccessory(new ThumbnailBuilder().setURL(url));
}

/**
 * The payload for send/reply/update/editReply: the given top-level components (boxes and button rows).
 * Mentions inside the text are shown but never ping anyone.
 */
export const message = (...components) => ({
  components: components.flat(),
  flags: MessageFlags.IsComponentsV2,
  allowedMentions: { parse: [] },
});

/** A message that is just a short line of text. */
export const say = (content) => message(box(content));

/** Same as `say`, but only the person who triggered it sees it. */
export const quiet = (content) => ({ ...say(content), flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });

// ── Reply helpers ──────────────────────────────────────────────────────────

/** Send an ephemeral error reply. */
export async function replyError(interaction, content) {
  if (interaction.deferred || interaction.replied) return interaction.editReply(say(content));
  return interaction.reply(quiet(content));
}

/** Send a short confirmation reply. */
export async function replySuccess(interaction, content) {
  if (interaction.deferred || interaction.replied) return interaction.editReply(say(content));
  return interaction.reply(say(content));
}

// ── Voice / player guards ──────────────────────────────────────────────────

/**
 * Ensure the member is in a voice channel the bot can use.
 * Returns { channel } or sends an error reply and returns null.
 */
export async function requireVoice(interaction) {
  const channel = interaction.member?.voice?.channel;
  if (!channel) {
    await replyError(interaction, 'You must be in a voice channel first.');
    return null;
  }
  const perms = channel.permissionsFor(interaction.client.user);
  if (!perms.has(['Connect', 'Speak'])) {
    await replyError(interaction, "I don't have permission to join your voice channel.");
    return null;
  }
  return { channel };
}

/**
 * Ensure a player exists and is active.
 * Returns the player or sends an error reply and returns null.
 */
export async function requirePlayer(interaction, { sameVoice = true } = {}) {
  const player = interaction.client.lavalink.getPlayer(interaction.guildId);
  if (!player) {
    await replyError(interaction, 'There is nothing playing right now.');
    return null;
  }
  // Anything that changes playback must come from someone listening in the bot's channel.
  if (sameVoice && interaction.member?.voice?.channelId !== player.voiceChannelId) {
    await replyError(interaction, `Join <#${player.voiceChannelId}> to control the player.`);
    return null;
  }
  return player;
}

/**
 * Refuse to pull the bot away from a channel that still has listeners.
 * Returns true when it is fine to (re)join `channel`.
 */
export async function requireJoinable(interaction, player, channel) {
  if (!player || player.voiceChannelId === channel.id) return true;
  const current = interaction.guild.channels.cache.get(player.voiceChannelId);
  const listeners = current?.members?.filter((m) => !m.user.bot).size ?? 0;
  if (listeners > 0) {
    await replyError(interaction, `I'm already playing for people in <#${player.voiceChannelId}>.`);
    return false;
  }
  return true;
}

/**
 * Ensure a player exists and has a current track.
 */
export async function requirePlaying(interaction, options) {
  const player = await requirePlayer(interaction, options);
  if (!player) return null;
  if (!player.queue.current) {
    await replyError(interaction, 'There is nothing playing right now.');
    return null;
  }
  return player;
}

// ── Format helpers ─────────────────────────────────────────────────────────

export function msToTime(ms) {
  if (!ms || ms < 0) return '0:00';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const ss = String(s % 60).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

export function progressBar(current, total, size = 15) {
  const pct = Math.min(current / total, 1);
  const filled = Math.round(pct * size);
  return '━'.repeat(filled) + '●' + '─'.repeat(size - filled);
}

export function truncate(str, len = 50) {
  if (!str) return 'Unknown';
  return str.length > len ? str.slice(0, len - 1) + '…' : str;
}

export function sourceBadge(source) {
  const badges = {
    deezer: 'Deezer',
    spotify: 'Spotify',
    applemusic: 'Apple Music',
    youtube: 'YouTube',
    soundcloud: 'SoundCloud',
    bandcamp: 'Bandcamp',
    twitch: 'Twitch',
    http: 'HTTP',
  };
  return badges[source?.toLowerCase()] ?? source ?? 'Unknown';
}


/** Who queued a track: a mention for a real user, plain text for autoplay. */
export function requesterLabel(requester) {
  if (!requester) return 'Unknown';
  return /^\d{15,25}$/.test(requester.id ?? '') ? `<@${requester.id}>` : requester.username ?? requester.tag ?? 'Unknown';
}

/** "[title](link)" when the track has a link, otherwise just the title. Brackets in titles would break the link. */
export function trackLink(info, len = 60) {
  const name = truncate(info.title, len).replace(/[[\]]/g, '');
  return info.uri ? `[${name}](${info.uri})` : name;
}

/** The "Now Playing" card: title and artist beside the artwork, then the progress line. */
export function nowPlayingCard(player) {
  const track = player.queue.current;
  if (!track) return box('Nothing is playing.');

  const { author, duration, isStream, artworkUrl } = track.info;
  const album = track.pluginInfo?.albumName;
  const sub = [requesterLabel(track.requester), album && truncate(album, 40)].filter(Boolean).join(' · ');
  const state = player.paused ? '⏸ Paused' : player.repeatMode !== 'off' ? `🔁 Loop (${player.repeatMode})` : null;

  const bar = isStream
    ? 'Live Stream'
    : `${msToTime(player.position)}  ${progressBar(player.position, duration)}  ${msToTime(duration)}`;

  const info = [`**${trackLink(track.info)}** — ${truncate(author, 30)}`, sub && small(sub), state && small(state)].filter(Boolean).join('\n');
  return box(withPicture(info, artworkUrl), small(bar));
}
