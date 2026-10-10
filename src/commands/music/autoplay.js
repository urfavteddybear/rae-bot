import { SlashCommandBuilder } from 'discord.js';
import { requirePlayer, replySuccess } from '../../utils/embeds.js';
import { lastfmEnabled, setAutoplay } from '../../utils/autoplay.js';

export default {
  data: new SlashCommandBuilder()
    .setName('autoplay')
    .setDescription('Toggle autoplay: keep the music going with related songs when the queue runs out'),

  async execute(interaction, client) {
    const player = await requirePlayer(interaction);
    if (!player) return;

    const enable = !(player.get('autoplay') ?? false);
    await setAutoplay(player, enable);

    if (!enable) return replySuccess(interaction, 'Autoplay is now **disabled**. Songs it had queued were removed.');

    const source = lastfmEnabled() ? 'Last.fm' : 'Deezer';
    const wait = player.queue.tracks.length ? ' It starts once the current queue runs out.' : '';
    return replySuccess(interaction, `Autoplay is now **enabled** (${source}). It queues 20 songs at a time.${wait}`);
  },
};
