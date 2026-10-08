import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('nodes')
    .setDescription('Show the status of all connected Lavalink nodes'),

  async execute(interaction, client) {
    await interaction.deferReply();

    const nodes = [...client.lavalink.nodeManager.nodes.values()];

    if (!nodes.length) {
      return interaction.editReply({ content: '❌  No Lavalink nodes configured.' });
    }

    const e = new EmbedBuilder()
      .setColor(parseInt(process.env.ACCENT_COLOR ?? '5865F2', 16))
      .setTitle('🔌  Lavalink Nodes');

    for (const node of nodes) {
      const stats = node.stats;
      const statusIcon = node.connected ? '🟢' : '🔴';
      const players = stats?.players ?? 0;
      const playingPlayers = stats?.playingPlayers ?? 0;
      const memory = stats?.memory
        ? `${Math.round(stats.memory.used / 1024 / 1024)}MB / ${Math.round(stats.memory.reservable / 1024 / 1024)}MB`
        : 'N/A';
      const cpu = stats?.cpu
        ? `${(stats.cpu.lavalinkLoad * 100).toFixed(1)}%`
        : 'N/A';
      const ping = node.ping ?? -1;

      e.addFields({
        name: `${statusIcon} ${node.id} — ${node.options.host}:${node.options.port}`,
        value: [
          `**Status:** ${node.connected ? 'Connected' : 'Disconnected'}`,
          `**Ping:** ${ping >= 0 ? `${ping}ms` : 'N/A'}`,
          `**Players:** ${playingPlayers}/${players} playing`,
          `**CPU:** ${cpu}`,
          `**Memory:** ${memory}`,
        ].join('\n'),
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [e] });
  },
};
