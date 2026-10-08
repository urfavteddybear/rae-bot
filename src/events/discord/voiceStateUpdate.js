import { getStay247, getStay247Data } from '../../utils/database.js';
import { log } from '../../utils/logger.js';

export default {
  name: 'voiceStateUpdate',
  once: false,
  async execute(oldState, newState, client) {
    const { guild } = newState;

    // ── Bot disconnected ─────────────────────────────────────────────────
    if (oldState.member?.id === client.user.id && !newState.channelId) {
      const stayData = getStay247Data(guild.id);
      if (stayData?.stay247) {
        const channelId = stayData.voiceChannelId || oldState.channelId;
        if (!channelId) return;
        setTimeout(async () => {
          try {
            let player = client.lavalink.getPlayer(guild.id);
            if (!player) {
              player = await client.lavalink.createPlayer({
                guildId: guild.id,
                voiceChannelId: channelId,
                textChannelId: stayData.textChannelId,
                selfDeaf: true,
                volume: 80,
              });
            } else {
              player.voiceChannelId = channelId;
              player.options.voiceChannelId = channelId;
            }
            await player.connect();
            log.info(`[247] Rejoined ${channelId} in ${guild.name}`);
          } catch (err) {
            log.warn(`[247] Failed to rejoin: ${err.message}`);
          }
        }, 3000);
      } else {
        const player = client.lavalink.getPlayer(guild.id);
        const timer = player?.get('alone_timer');
        if (timer) clearTimeout(timer);
        try { await player?.destroy(); } catch { /* ignore */ }
      }
      return;
    }

    // ── Check if members changed in the bot's voice channel ─────────────
    const botVc = guild.members.me?.voice?.channel;
    if (!botVc) return;

    // Ignore events that don't involve the bot's current channel
    if (oldState.channelId !== botVc.id && newState.channelId !== botVc.id) return;

    const player = client.lavalink.getPlayer(guild.id);
    if (!player) return;

    const humanMembers = botVc.members.filter(m => !m.user.bot);

    // Someone joined or is present in the channel -> cancel any pending alone disconnect timer
    if (humanMembers.size > 0) {
      const timer = player.get('alone_timer');
      if (timer) {
        clearTimeout(timer);
        player.set('alone_timer', null);
      }
      return;
    }

    // ── Bot is alone in the channel ───────────────────────────────────────
    // If 24/7 is enabled, the bot stays in VC
    if (getStay247(guild.id)) return;

    // If songs are still playing / queued, the bot is allowed to stay in VC
    if (player.playing || player.queue.current) return;

    // Nothing playing, not 24/7, and no humans: auto-disconnect after 2 minutes
    if (!player.get('alone_timer')) {
      const timer = setTimeout(async () => {
        player.set('alone_timer', null);
        try {
          await player.destroy();
        } catch { /* ignore */ }
      }, 120_000);
      player.set('alone_timer', timer);
    }
  },
};
