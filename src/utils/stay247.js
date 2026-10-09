/**
 * In-memory 24/7 mode store.
 * Tracks guild voice channel persistence during runtime without a database.
 * Resets cleanly on process restart.
 */

/** @type {Map<string, { stay247: boolean, voiceChannelId: string | null, textChannelId: string | null }>} */
const stay247Map = new Map();

/**
 * Toggle or set 24/7 mode with voice/text channel targets.
 * @param {string} guildId
 * @param {boolean} value
 * @param {string | null} [voiceChannelId=null]
 * @param {string | null} [textChannelId=null]
 * @returns {boolean}
 */
export function setStay247(guildId, value, voiceChannelId = null, textChannelId = null) {
  if (value) {
    stay247Map.set(guildId, { stay247: true, voiceChannelId, textChannelId });
    return true;
  }
  stay247Map.delete(guildId);
  return false;
}

/**
 * Check if 24/7 mode is enabled for a guild.
 * @param {string} guildId
 * @returns {boolean}
 */
export function getStay247(guildId) {
  return stay247Map.get(guildId)?.stay247 === true;
}

/**
 * Get 24/7 mode data for a guild.
 * @param {string} guildId
 * @returns {{ stay247: boolean, voiceChannelId: string | null, textChannelId: string | null }}
 */
export function getStay247Data(guildId) {
  return stay247Map.get(guildId) ?? {
    stay247: false,
    voiceChannelId: null,
    textChannelId: null,
  };
}
