/**
 * 24/7 mode: the bot stays in its voice channel even when nothing is playing.
 *
 * It only suppresses the two automatic leaves (the timer after the queue ends, and the timer when the
 * bot is alone in the channel). It does not bring the bot back: if the bot is kicked or disconnected,
 * the session ends like any other and 24/7 switches itself off.
 *
 * Kept in memory, so it resets when the bot restarts.
 */

/** @type {Set<string>} guild ids with 24/7 mode on */
const enabled = new Set();

/** Is 24/7 mode on for this guild? */
export const getStay247 = (guildId) => enabled.has(guildId);

/** Set 24/7 mode for a guild (without touching any player). */
export function setStay247(guildId, value) {
  if (value) enabled.add(guildId);
  else enabled.delete(guildId);
  return value;
}

/**
 * Turn 24/7 mode on or off for a guild. Turning it on joins the given voice channel when the bot
 * isn't in one yet. Shared by the /247 command and the dashboard.
 * @param {import('discord.js').Client} client
 * @param {string} guildId
 * @param {boolean} enable
 * @param {{ voiceChannelId?: string, textChannelId?: string }} [channels] used when there is no player yet
 */
export async function applyStay247(client, guildId, enable, channels = {}) {
  if (enable && !client.lavalink.getPlayer(guildId)) {
    const player = await client.lavalink.createPlayer({
      guildId,
      voiceChannelId: channels.voiceChannelId,
      textChannelId: channels.textChannelId,
      selfDeaf: true,
      volume: 100,
    });
    await player.connect();
  }
  setStay247(guildId, enable);
}
