import { log } from '../../utils/logger.js';
import { say, truncate } from '../../utils/ui.js';

export default {
  name: 'trackStuck',
  emitter: 'player',
  async execute(player, track, payload, client) {
    log.warn(`Track stuck in guild ${player.guildId} for "${track?.info?.title}" at threshold ${payload?.thresholdMs}ms`);

    const channel = client.channels.cache.get(player.textChannelId);
    if (!channel?.isTextBased()) return;

    try {
      await channel.send(say(`Playback stuck on **${truncate(track?.info?.title ?? 'track', 40)}**. Skipping...`));
    } catch {
      // ignore
    }
  },
};
