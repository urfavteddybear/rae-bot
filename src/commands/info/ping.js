import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Show bot and API latency'),

  async execute(interaction, client) {
    const sent = await interaction.deferReply({ fetchReply: true });
    const apiPing = client.ws.ping;
    const botPing = sent.createdTimestamp - interaction.createdTimestamp;

    const e = new EmbedBuilder()
      .setColor(parseInt(process.env.ACCENT_COLOR ?? '5865F2', 16))
      .setTitle('🏓  Pong!')
      .addFields(
        { name: '🤖 Bot Latency', value: `\`${botPing}ms\``, inline: true },
        { name: '🌐 API Latency', value: `\`${apiPing}ms\``, inline: true },
      );

    await interaction.editReply({ embeds: [e] });
  },
};
