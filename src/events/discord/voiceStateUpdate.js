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
        try { await player?.destroy(); } catch { /* ignore */ }
      }
      return;
    }

    // ── Bot left alone in channel ────────────────────────────────────────
    if (!oldState.channelId) return;
    const botVc = guild.members.me?.voice?.channel;
    if (!botVc) return;
    if (botVc.id !== oldState.channelId) return;
    if (getStay247(guild.id)) return;

    const realMembers = botVc.members.filter(m => !m.user.bot);
    if (realMembers.size === 0) {
      const player = client.lavalink.getPlayer(guild.id);
      if (!player) return;
      // Pause and auto-destroy after 2 minutes
      if (player.playing) player.pause(true);
      const timer = setTimeout(async () => {
        try {
          await player.destroy();
        } catch { /* ignore */ }
      }, 120_000);
      // Resume if someone rejoins
      const resume = (os, ns) => {
        if (ns.channelId === botVc.id && !ns.member?.user.bot) {
          clearTimeout(timer);
          client.off('voiceStateUpdate', resume);
          player.pause(false).catch(() => {});
        }
      };
      client.on('voiceStateUpdate', resume);
    }
  },
};
