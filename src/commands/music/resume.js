import { SlashCommandBuilder } from 'discord.js';
import { resumePlayer } from '../../utils/playback.js';
import { requirePlayer, replyError, replySuccess } from '../../utils/ui.js';

export default {
  data: new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Resume the paused player'),

  async execute(interaction, client) {
    const player = await requirePlayer(interaction);
    if (!player) return;

    if (!player.paused) return replyError(interaction, 'The player is not paused.');
    await resumePlayer(player);
    await replySuccess(interaction, 'Resumed playback.');
  },
};
