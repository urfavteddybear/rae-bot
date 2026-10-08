import { log } from '../../utils/logger.js';
import { errorEmbed, truncate } from '../../utils/embeds.js';

export default {
  name: 'trackError',
  emitter: 'player',
  async execute(player, track, payload, client) {
    const errorMsg = payload?.message || payload?.error || 'Unknown playback error';
    log.error(`Track error in guild ${player.guildId} for "${track?.info?.title}": ${errorMsg}`);

    const channel = client.channels.cache.get(player.textChannelId);
    if (!channel?.isTextBased()) return;

    try {
      await channel.send({
        embeds: [errorEmbed(`Failed to play **${truncate(track?.info?.title ?? 'track', 40)}**: ${errorMsg}`)],
      });
    } catch {
      // ignore
    }
  },
};
