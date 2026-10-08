import { log } from '../../utils/logger.js';
import { nowPlayingEmbed } from '../../utils/embeds.js';

export default {
  name: 'trackStart',
  emitter: 'player',
  async execute(player, track, payload, client) {
    const channel = client.channels.cache.get(player.textChannelId);
    if (!channel?.isTextBased()) return;

    try {
      await channel.send({ embeds: [nowPlayingEmbed(player)] });
    } catch (err) {
      log.warn(`trackStart: could not send to channel ${player.textChannelId}: ${err.message}`);
    }
  },
};
