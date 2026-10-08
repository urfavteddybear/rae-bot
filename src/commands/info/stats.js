import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { msToTime } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Show bot statistics'),

  async execute(interaction, client) {
    const uptime = msToTime(client.uptime);
    const guilds = client.guilds.cache.size;
    const players = client.lavalink.players.size;
    const playing = [...client.lavalink.players.values()].filter(p => p.playing).length;

    const mem = process.memoryUsage();
    const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
    const rssMB  = Math.round(mem.rss / 1024 / 1024);

    // Sum Lavalink stats across nodes
    let lavaPlayers = 0, lavaPlaying = 0;
    for (const node of client.lavalink.nodeManager.nodes.values()) {
      lavaPlayers  += node.stats?.players ?? 0;
      lavaPlaying  += node.stats?.playingPlayers ?? 0;
    }

    const e = new EmbedBuilder()
      .setColor(parseInt(process.env.ACCENT_COLOR ?? '5865F2', 16))
      .setTitle('📊  Rae Statistics')
      .setThumbnail(client.user.displayAvatarURL())
      .addFields(
        { name: '⏱️ Uptime',   value: uptime,            inline: true },
        { name: '🏠 Servers',  value: `${guilds}`,        inline: true },
        { name: '🎵 Players',  value: `${playing}/${players} active`, inline: true },
        { name: '💾 Heap',     value: `${heapMB}MB`,      inline: true },
        { name: '📦 RSS',      value: `${rssMB}MB`,       inline: true },
        { name: '🌐 Shards',   value: `${client.ws.shards.size || 1}`, inline: true },
        { name: '🔌 Lavalink', value: `${lavaPlaying}/${lavaPlayers} playing`, inline: true },
        { name: '🤖 Discord.js', value: `v${(await import('discord.js')).version}`, inline: true },
        { name: '🟩 Node.js',  value: process.version, inline: true },
      )
      .setFooter({ text: `PID ${process.pid}` });

    await interaction.reply({ embeds: [e] });
  },
};
