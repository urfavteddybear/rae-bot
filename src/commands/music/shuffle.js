import { SlashCommandBuilder } from 'discord.js';
import { requirePlayer, replyError, replySuccess } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('shuffle')
    .setDescription('Shuffle the queue'),

  async execute(interaction, client) {
    const player = await requirePlayer(interaction);
    if (!player) return;

    if (!player.queue.tracks.length) {
      return replyError(interaction, 'There are no upcoming tracks to shuffle.');
    }

    player.queue.shuffle();
    await replySuccess(interaction, `Shuffled **${player.queue.tracks.length}** tracks.`);
  },
};
