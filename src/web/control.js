import { MAX_QUEUE_SIZE } from '../utils/limits.js';
import { resetAutoplay, setAutoplay } from '../utils/autoplay.js';
import { findSong } from './catalog.js';
import { applyStay247, getStay247 } from '../utils/stay247.js';

const DEEZER_URL = /^https:\/\/(www\.)?deezer\.com\/(?:[a-z]{2}\/)?(track|album|artist|playlist)\/\d{1,15}$/;

export class ControlError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const int = (v, min, max) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new ControlError('Invalid number');
  return n;
};

/**
 * Queue actions address tracks by index, but the queue can change between the click and the request.
 * Clients send the track id too; a mismatch means the index is stale.
 */
function expectTrack(tracks, index, id) {
  if (id === undefined) return;
  if (typeof id !== 'string' || tracks[index]?.info.identifier !== id) throw new ControlError('The queue changed. Try again.', 409);
}

/**
 * Work out whether `userId` may control the player in `guild`.
 * Rule: be in the same voice channel as the bot (or, with no player, any joinable channel).
 */
export function userVoiceChannel(guild, userId) {
  return guild.voiceStates.cache.get(userId)?.channel ?? null;
}

async function ensurePlayer(client, guild, userId, textChannelId) {
  const vc = userVoiceChannel(guild, userId);
  if (!vc) throw new ControlError('Join a voice channel first.', 403);

  let player = client.lavalink.getPlayer(guild.id);
  if (player && player.voiceChannelId !== vc.id) {
    throw new ControlError('Join the same voice channel as the bot.', 403);
  }
  if (!player) {
    if (!vc.permissionsFor(client.user).has(['Connect', 'Speak'])) {
      throw new ControlError("I don't have permission to join your voice channel.", 403);
    }
    player = await client.lavalink.createPlayer({
      guildId: guild.id,
      voiceChannelId: vc.id,
      textChannelId: textChannelId ?? vc.id,
      selfDeaf: true,
      volume: 100,
    });
  }
  if (!player.connected) await player.connect();
  return player;
}

function requireExisting(client, guild, userId) {
  const player = client.lavalink.getPlayer(guild.id);
  if (!player) throw new ControlError('Nothing is playing right now.', 404);
  if (userVoiceChannel(guild, userId)?.id !== player.voiceChannelId) {
    throw new ControlError('Join the same voice channel as the bot to control playback.', 403);
  }
  return player;
}

/** Who a song is credited to: the person who clicked, so profile stats and "Queued by" are right. */
function requesterOf(guild, user) {
  return guild.members.cache.get(user.id)?.user ?? { id: user.id, username: user.name, displayAvatarURL: () => user.avatar };
}

/** Bring the bot into the user's voice channel (the same rules as /join). */
async function joinUser(client, guild, userId) {
  const vc = userVoiceChannel(guild, userId);
  if (!vc) throw new ControlError('Join a voice channel first.', 403);
  let player = client.lavalink.getPlayer(guild.id);

  if (player && player.voiceChannelId !== vc.id) {
    const current = guild.channels.cache.get(player.voiceChannelId);
    const listeners = current?.members?.filter((m) => !m.user.bot).size ?? 0;
    if (listeners > 0) throw new ControlError("I'm already playing for people in another channel.", 403);
  }
  if (!vc.permissionsFor(client.user).has(['Connect', 'Speak'])) {
    throw new ControlError("I don't have permission to join your voice channel.", 403);
  }

  if (!player) {
    player = await client.lavalink.createPlayer({ guildId: guild.id, voiceChannelId: vc.id, textChannelId: vc.id, selfDeaf: true, volume: 100 });
  } else if (player.voiceChannelId !== vc.id) {
    player.voiceChannelId = vc.id;
    player.options.voiceChannelId = vc.id;
  }
  if (!player.connected) await player.connect();
}

export async function perform(client, guild, user, action, body = {}) {
  if (action === 'join') return joinUser(client, guild, user.id);

  // 24/7 mode: the bot stays in the voice channel even when nothing is playing. Anyone in the bot's channel can toggle it.
  if (action === 'stay247') {
    const vc = userVoiceChannel(guild, user.id);
    const player = client.lavalink.getPlayer(guild.id);
    if (!vc) throw new ControlError('Join a voice channel first.', 403);
    if (player && vc.id !== player.voiceChannelId) throw new ControlError("Join the bot's voice channel to change 24/7 mode.", 403);
    if (!player && !vc.permissionsFor(client.user).has(['Connect', 'Speak'])) {
      throw new ControlError("I don't have permission to join your voice channel.", 403);
    }
    await applyStay247(client, guild.id, !getStay247(guild.id), { voiceChannelId: vc.id, textChannelId: vc.id });
    return;
  }

  // A song from the profile shelves: a Deezer link if we kept one, otherwise found by title and artist.
  if (action === 'addSong') {
    const title = String(body.title ?? '').slice(0, 200).trim();
    const author = String(body.author ?? '').slice(0, 200).trim();
    if (!title) throw new ControlError('Missing song');
    const stored = typeof body.uri === 'string' && body.uri.length < 200 && /\/track\/\d+$/.test(body.uri) && DEEZER_URL.test(body.uri) ? body.uri : null;
    const url = stored ?? await findSong(title, author).catch(() => null);
    if (!url) throw new ControlError("Couldn't find that song to play.", 404);
    return perform(client, guild, user, 'add', { url, now: !!body.now });
  }

  if (action === 'add') {
    const url = String(body.url ?? '');
    if (!DEEZER_URL.test(url)) throw new ControlError('Unsupported link.');
    const member = guild.members.cache.get(user.id);
    const requester = member?.user ?? { id: user.id, username: user.name, displayAvatarURL: () => user.avatar };
    const player = await ensurePlayer(client, guild, user.id);
    const res = await player.search({ query: url }, requester);
    if (!res?.tracks?.length || res.loadType === 'error' || res.loadType === 'empty') {
      throw new ControlError('Could not load that from Lavalink.', 404);
    }
    const room = MAX_QUEUE_SIZE - player.queue.tracks.length;
    if (room <= 0) throw new ControlError(`The queue is full (${MAX_QUEUE_SIZE} tracks).`);
    const tracks = (res.loadType === 'playlist' ? res.tracks : [res.tracks[0]]).slice(0, room);
    const hadCurrent = !!player.queue.current;
    if ((body.next || body.now) && hadCurrent) await player.queue.splice(0, 0, tracks);
    else await player.queue.add(tracks);
    if (!hadCurrent) await player.play();
    else if (body.now) await player.skip();
    // Playing a song right now: autoplay restarts from this song instead of the previous one.
    if (body.now) await resetAutoplay(player);
    return;
  }

  const player = requireExisting(client, guild, user.id);
  const queue = player.queue;

  switch (action) {
    case 'pause':
      if (!player.paused) await player.pause();
      break;
    case 'resume':
      if (player.paused) await player.resume();
      break;
    case 'toggle':
      if (player.paused) await player.resume();
      else await player.pause();
      break;
    case 'skip':
      if (!queue.current) throw new ControlError('Nothing is playing right now.', 404);
      if (queue.tracks.length) await player.skip();
      else await player.stopPlaying(true, false);
      break;
    case 'previous': {
      const prev = queue.previous[0];
      if (!prev) throw new ControlError('No previous tracks.');
      queue.splice(0, 0, prev);
      await player.skip();
      break;
    }
    case 'stop':
      await player.stopPlaying(true, false);
      break;
    case 'seek':
      if (!queue.current || queue.current.info.isStream) throw new ControlError('Cannot seek this track.');
      await player.seek(int(body.position, 0, queue.current.info.duration));
      break;
    case 'volume':
      await player.setVolume(int(body.volume, 1, 150));
      break;
    case 'loop':
      if (!['off', 'track', 'queue'].includes(body.mode)) throw new ControlError('Invalid loop mode');
      await player.setRepeatMode(body.mode);
      break;
    case 'shuffle':
      if (queue.tracks.length > 1) await queue.shuffle();
      break;
    case 'autoplay':
      await setAutoplay(player, !player.get('autoplay'));
      break;
    case 'clear':
      if (queue.tracks.length) await queue.splice(0, queue.tracks.length);
      break;
    case 'remove': {
      const idx = int(body.index, 0, queue.tracks.length - 1);
      expectTrack(queue.tracks, idx, body.id);
      await queue.splice(idx, 1);
      break;
    }
    case 'jump': {
      const idx = int(body.index, 0, queue.tracks.length - 1);
      expectTrack(queue.tracks, idx, body.id);
      await queue.splice(0, idx);
      await player.skip();
      await resetAutoplay(player);
      break;
    }
    case 'move': {
      const len = queue.tracks.length;
      const from = int(body.from, 0, len - 1);
      const to = int(body.to, 0, len - 1);
      expectTrack(queue.tracks, from, body.id);
      const [track] = queue.tracks.splice(from, 1);
      queue.tracks.splice(to, 0, track);
      break;
    }
    case 'requeueHistory': {
      const idx = int(body.index, 0, queue.previous.length - 1);
      expectTrack(queue.previous, idx, body.id);
      if (queue.tracks.length >= MAX_QUEUE_SIZE) throw new ControlError(`The queue is full (${MAX_QUEUE_SIZE} tracks).`);
      await queue.add({ ...queue.previous[idx], requester: requesterOf(guild, user) });
      if (!queue.current) await player.play();
      break;
    }
    case 'playHistory': {
      const idx = int(body.index, 0, queue.previous.length - 1);
      expectTrack(queue.previous, idx, body.id);
      const track = { ...queue.previous[idx], requester: requesterOf(guild, user) };
      queue.splice(0, 0, track);
      if (queue.current) await player.skip();
      else await player.play();
      await resetAutoplay(player);
      break;
    }
    default:
      throw new ControlError('Unknown action', 404);
  }
}
