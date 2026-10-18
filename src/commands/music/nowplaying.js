import { SlashCommandBuilder } from 'discord.js';
import { message, nowPlayingCard, requirePlaying } from '../../utils/ui.js';

export default {
  data: new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Show the currently playing track'),

  async execute(interaction, client) {
    const player = await requirePlaying(interaction);
    if (!player) return;

    await interaction.reply(message(nowPlayingCard(player)));
  },
};
