import { SlashCommandBuilder } from 'discord.js';
import { requirePlaying, replyError, nowPlayingEmbed } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Show the currently playing track'),

  async execute(interaction, client) {
    const player = await requirePlaying(interaction);
    if (!player) return;

    await interaction.reply({ embeds: [nowPlayingEmbed(player)] });
  },
};
