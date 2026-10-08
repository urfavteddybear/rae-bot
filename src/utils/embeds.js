import { EmbedBuilder } from 'discord.js';

const ACCENT = parseInt(process.env.ACCENT_COLOR ?? '5865F2', 16);

// ── Core embed builders ────────────────────────────────────────────────────

export function embed(description, colour = ACCENT) {
  return new EmbedBuilder().setDescription(description).setColor(colour);
}

export function successEmbed(description) {
  return embed(`✅  ${description}`, 0x57f287);
}

export function errorEmbed(description) {
  return embed(`❌  ${description}`, 0xed4245);
}

export function warnEmbed(description) {
  return embed(`⚠️  ${description}`, 0xfee75c);
}

// ── Reply helpers ──────────────────────────────────────────────────────────

/** Send an ephemeral error reply. */
export async function replyError(interaction, message) {
  const payload = { embeds: [errorEmbed(message)], ephemeral: true };
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(payload);
  }
  return interaction.reply(payload);
}

/** Send an ephemeral success reply. */
export async function replySuccess(interaction, message) {
  const payload = { embeds: [successEmbed(message)], ephemeral: false };
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(payload);
  }
  return interaction.reply(payload);
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
export async function requirePlayer(interaction) {
  const player = interaction.client.lavalink.getPlayer(interaction.guildId);
  if (!player) {
    await replyError(interaction, 'There is nothing playing right now.');
    return null;
  }
  return player;
}

/**
 * Ensure a player exists and has a current track.
 */
export async function requirePlaying(interaction) {
  const player = await requirePlayer(interaction);
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
  return '▬'.repeat(filled) + '🔘' + '▬'.repeat(size - filled);
}

export function truncate(str, len = 50) {
  if (!str) return 'Unknown';
  return str.length > len ? str.slice(0, len - 1) + '…' : str;
}

export function sourceBadge(source) {
  const badges = {
    deezer:      '<:deezer:0> Deezer',
    spotify:     '<:spotify:0> Spotify',
    applemusic:  '<:apple:0> Apple Music',
    youtube:     '<:youtube:0> YouTube',
    soundcloud:  '<:sc:0> SoundCloud',
    bandcamp:    'Bandcamp',
    twitch:      'Twitch',
    http:        'HTTP',
  };
  return badges[source?.toLowerCase()] ?? source ?? 'Unknown';
}

export function nowPlayingEmbed(player, extra = {}) {
  const track = player.queue.current;
  if (!track) return errorEmbed('Nothing is playing.');

  const pos = player.position;
  const dur = track.info.duration;
  const isStream = track.info.isStream;

  const bar = isStream
    ? '🔴 LIVE'
    : `${msToTime(pos)} ${progressBar(pos, dur)} ${msToTime(dur)}`;

  const loopIcon = player.repeatMode === 'track'
    ? '🔂'
    : player.repeatMode === 'queue'
    ? '🔁'
    : '';

  return new EmbedBuilder()
    .setColor(ACCENT)
    .setAuthor({ name: '🎵  Now Playing' })
    .setTitle(truncate(track.info.title, 60))
    .setURL(track.info.uri ?? null)
    .setDescription(bar)
    .setThumbnail(track.info.artworkUrl ?? null)
    .addFields(
      { name: 'Artist', value: truncate(track.info.author, 30), inline: true },
      { name: 'Volume', value: `${player.volume}%`, inline: true },
      { name: loopIcon || '▶️', value: loopIcon ? 'Loop' : 'Playing', inline: true },
    )
    .setFooter({ text: `Requested by ${track.requester?.tag ?? 'Unknown'}` });
}
