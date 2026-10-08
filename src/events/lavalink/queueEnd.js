import { embed } from '../../utils/embeds.js';

export default {
  name: 'queueEnd',
  emitter: 'player',
  async execute(player, track, payload, client) {
    const channel = client.channels.cache.get(player.textChannelId);

    // ── Autoplay ─────────────────────────────────────────────────────────
    if (player.get('autoplay') && track) {
      const searchEngine = process.env.DEFAULT_SEARCH_ENGINE ?? 'dzsearch';
      const query = `${searchEngine}:${track.info.title} ${track.info.author}`;

      try {
        const res = await player.search({ query }, { id: 'autoplay', tag: 'Autoplay' });
        if (res?.tracks?.length) {
          // Pick a track that isn't the same as what just finished
          const next = res.tracks.find(t => t.info.uri !== track.info.uri) ?? res.tracks[0];
          await player.queue.add(next);
          if (!player.playing) await player.play();
          return; // don't send "queue finished" message
        }
      } catch { /* fall through */ }
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
