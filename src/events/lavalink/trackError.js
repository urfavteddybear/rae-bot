import { log } from '../../utils/logger.js';
import { say, truncate } from '../../utils/ui.js';

export default {
  name: 'trackError',
  emitter: 'player',
  async execute(player, track, payload, client) {
    const errorMsg = payload?.message || payload?.error || 'Unknown playback error';
    log.error(`Track error in guild ${player.guildId} for "${track?.info?.title}": ${errorMsg}`);

    const channel = client.channels.cache.get(player.textChannelId);
    if (!channel?.isTextBased()) return;

    try {
      await channel.send(say(`Failed to play **${truncate(track?.info?.title ?? 'track', 40)}**: ${errorMsg}`));
    } catch {
      // ignore
    }
  },
};
