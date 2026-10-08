import { SlashCommandBuilder } from 'discord.js';
import { requirePlayer, replyError, replySuccess } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Clear all tracks from the queue (keeps the current track)'),

  async execute(interaction, client) {
    const player = await requirePlayer(interaction);
    if (!player) return;

    if (!player.queue.tracks.length) {
      return replyError(interaction, 'The queue is already empty.');
    }

    const count = player.queue.tracks.length;
    player.queue.splice(0, player.queue.tracks.length);
    await replySuccess(interaction, `🗑️  Cleared **${count}** tracks from the queue.`);
  },
};
