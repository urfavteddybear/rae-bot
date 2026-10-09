import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { embed } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('dashboard')
    .setDescription('Open the web player dashboard for this server'),

  async execute(interaction, client) {
    const port = process.env.DASHBOARD_PORT || 3000;
    const baseUrl = process.env.DASHBOARD_URL || `http://localhost:${port}`;
    const url = `${baseUrl}/?guild=${interaction.guildId}`;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Open Web Dashboard')
        .setStyle(ButtonStyle.Link)
        .setURL(url),
    );

    const e = embed('Control playback, view synced lyrics, and manage the queue directly in your browser.')
      .setTitle('Web Player Dashboard');

    await interaction.reply({ embeds: [e], components: [row] });
  },
};
