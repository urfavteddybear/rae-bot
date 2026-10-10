import { embed } from '../../utils/embeds.js';
import { topUpAutoplay } from '../../utils/autoplay.js';

export default {
  name: 'queueEnd',
  emitter: 'player',
  async execute(player, track, payload, client) {
    const channel = client.channels.cache.get(player.textChannelId);

    // ── Autoplay ─────────────────────────────────────────────────────────
    if (player.get('autoplay')) {
      // A refill started at trackStart may still be running; wait for its first song (or the end).
      for (let i = 0; i < 120 && player.get('autoplayBusy') && !player.queue.tracks.length; i++) await new Promise((r) => setTimeout(r, 250));
      if (!player.queue.tracks.length) await topUpAutoplay(player, 1);
      if (player.queue.tracks.length) {
        if (!player.playing) await player.play();
        return; // don't send "queue finished" message
      }
    }

    const prevMsg = player.get('nowPlayingMessage');
    if (prevMsg) {
      prevMsg.delete().catch(() => {});
      player.set('nowPlayingMessage', null);
    }

    if (channel?.isTextBased()) {
      channel.send({ embeds: [embed('Queue finished. Add more songs with `/play`')] }).catch(() => {});
    }
  },
};
