import { log } from '../../utils/logger.js';
import { nowPlayingEmbed } from '../../utils/embeds.js';

export default {
  name: 'trackStart',
  emitter: 'player',
  async execute(player, track, payload, client) {
    const channel = client.channels.cache.get(player.textChannelId);
    if (!channel?.isTextBased()) return;

    // Delete the previous now playing message to prevent chat clutter
    const prevMsg = player.get('nowPlayingMessage');
    if (prevMsg) {
      prevMsg.delete().catch(() => {});
      player.set('nowPlayingMessage', null);
    }

    try {
      const msg = await channel.send({ embeds: [nowPlayingEmbed(player)] });
      player.set('nowPlayingMessage', msg);
    } catch (err) {
      log.warn(`trackStart: could not send to channel ${player.textChannelId}: ${err.message}`);
    }
  },
};
