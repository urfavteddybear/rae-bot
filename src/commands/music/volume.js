import { SlashCommandBuilder } from 'discord.js';
import { requirePlayer, replyError, replySuccess } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Set the playback volume')
    .addIntegerOption(o => o
      .setName('level')
      .setDescription('Volume level (1–150)')
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(150)),

  async execute(interaction, client) {
    const player = await requirePlayer(interaction);
    if (!player) return;

    const level = interaction.options.getInteger('level', true);
    await player.setVolume(level);
    await replySuccess(interaction, `Volume set to **${level}%**.`);
  },
};
