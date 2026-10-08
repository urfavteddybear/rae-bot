import { log } from '../../utils/logger.js';
import { embed } from '../../utils/embeds.js';

export default {
  name: 'trackEnd',
  emitter: 'player',
  async execute(player, track, payload, client) {
    // autoSkip is enabled on the manager, so nothing to do manually.
    // Only log errors.
    if (payload?.reason === 'loadFailed') {
      const channel = client.channels.cache.get(player.textChannelId);
      if (channel?.isTextBased()) {
        channel.send({ embeds: [embed(`⚠️  Failed to load **${track?.info?.title ?? 'Unknown'}** — skipping.`, 0xfee75c)] }).catch(() => {});
      }
    }
  },
};
