import { SlashCommandBuilder } from 'discord.js';
import { requirePlayer, replyError, replySuccess } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pause the current track'),

  async execute(interaction, client) {
    const player = await requirePlayer(interaction);
    if (!player) return;

    if (player.paused) return replyError(interaction, 'Already paused. Use `/resume`.');
    await player.pause(true);
    await replySuccess(interaction, 'Paused the player. Use `/resume` to continue.');
  },
};
