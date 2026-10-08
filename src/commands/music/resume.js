import { SlashCommandBuilder } from 'discord.js';
import { requirePlayer, replyError, replySuccess } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Resume the paused player'),

  async execute(interaction, client) {
    const player = await requirePlayer(interaction);
    if (!player) return;

    if (!player.paused) return replyError(interaction, 'The player is not paused.');
    await player.pause(false);
    await replySuccess(interaction, 'Resumed playback.');
  },
};
