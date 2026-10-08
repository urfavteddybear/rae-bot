import { SlashCommandBuilder } from 'discord.js';
import { requirePlayer, replyError, replySuccess, truncate } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Remove a track from the queue by position')
    .addIntegerOption(o => o
      .setName('position')
      .setDescription('Track position in queue (1 = next track)')
      .setRequired(true)
      .setMinValue(1)),

  async execute(interaction, client) {
    const player = await requirePlayer(interaction);
    if (!player) return;

    const pos = interaction.options.getInteger('position', true);
    const idx = pos - 1;

    if (idx >= player.queue.tracks.length) {
      return replyError(interaction, `Queue only has **${player.queue.tracks.length}** tracks.`);
    }

    const removed = player.queue.tracks[idx];
    player.queue.splice(idx, 1);
    await replySuccess(interaction, `Removed **${truncate(removed.info.title)}** from position **${pos}**.`);
  },
};
