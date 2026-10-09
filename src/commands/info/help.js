import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

const COMMANDS = [
  { category: 'Music',   list: ['play', 'search', 'nowplaying', 'queue', 'skip', 'pause', 'resume', 'volume', 'loop', 'shuffle'] },
  { category: 'Queue',   list: ['clear', 'remove', 'jump', 'move', 'previous', 'replay', 'seek', 'autoplay'] },
  { category: 'Player',  list: ['join', 'disconnect', '247', 'save', 'lyrics', 'debug'] },
  { category: 'Info',    list: ['help', 'invite', 'nodes', 'ping', 'stats'] },
];

export default {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show all available commands'),

  async execute(interaction, client) {
    const e = new EmbedBuilder()
      .setColor(parseInt(process.env.ACCENT_COLOR ?? '5865F2', 16))
      .setTitle('Rae — Commands')
      .setDescription('A fast, lightweight Discord music bot. Use `/play` to get started.')
      .setThumbnail(client.user.displayAvatarURL());

    for (const { category, list } of COMMANDS) {
      e.addFields({
        name: category,
        value: list.map(c => `\`/${c}\``).join(' '),
        inline: false,
      });
    }

    if (process.env.SUPPORT_SERVER) {
      e.addFields({ name: 'Support', value: `[Join support server](${process.env.SUPPORT_SERVER})`, inline: true });
    }
    if (process.env.INVITE_URL) {
      e.addFields({ name: 'Invite', value: `[Add to your server](${process.env.INVITE_URL})`, inline: true });
    }

    e.setFooter({ text: `${client.guilds.cache.size} servers • Requested by ${interaction.user.tag}` });
    await interaction.reply({ embeds: [e] });
  },
};
