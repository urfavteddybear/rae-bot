import { SlashCommandBuilder } from 'discord.js';
import { requirePlayer, replyError, replySuccess, truncate } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('previous')
    .setDescription('Play the previous track'),

  async execute(interaction, client) {
    const player = await requirePlayer(interaction);
    if (!player) return;

    if (!player.queue.previous?.length) {
      return replyError(interaction, 'No previous tracks in history.');
    }

    const prev = player.queue.previous[player.queue.previous.length - 1];
    // Add previous track to front of queue and skip
    player.queue.splice(0, 0, prev);
    await player.skip();
    await replySuccess(interaction, `⏮️  Playing **${truncate(prev.info.title)}**.`);
  },
};
