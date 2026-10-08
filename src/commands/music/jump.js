import { SlashCommandBuilder } from 'discord.js';
import { requirePlayer, replyError, replySuccess, truncate } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('jump')
    .setDescription('Jump to a specific track in the queue')
    .addIntegerOption(o => o
      .setName('position')
      .setDescription('Track position to jump to (1 = next track)')
      .setRequired(true)
      .setMinValue(1)),

  async execute(interaction, client) {
    const player = await requirePlayer(interaction);
    if (!player) return;

    const pos = interaction.options.getInteger('position', true);
    const idx = pos - 1;

    if (idx >= player.queue.tracks.length) {
      return replyError(interaction, `Queue only has **${player.queue.tracks.length}** upcoming tracks.`);
    }

    const track = player.queue.tracks[idx];
    // Remove all tracks before the jumped-to track
    player.queue.splice(0, idx);
    await player.skip();
    await replySuccess(interaction, `Jumped to **${truncate(track.info.title)}**.`);
  },
};
