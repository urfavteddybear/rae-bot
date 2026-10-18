import { SlashCommandBuilder } from 'discord.js';
import { box, message, small, withPicture } from '../../utils/ui.js';

const COMMANDS = [
  { category: 'Music',   list: ['play', 'search', 'nowplaying', 'queue', 'skip', 'pause', 'resume', 'volume', 'loop', 'shuffle'] },
  { category: 'Queue',   list: ['clear', 'remove', 'jump', 'move', 'previous', 'replay', 'seek', 'autoplay'] },
  { category: 'Player',  list: ['join', 'disconnect', '247', 'save', 'lyrics', 'debug'] },
  { category: 'Info',    list: ['help', 'invite', 'ping', 'stats'] },
];

export default {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show all available commands'),

  async execute(interaction, client) {
    const sections = COMMANDS.map(({ category, list }) => `${small(category)}\n${list.map(c => `\`/${c}\``).join(' ')}`);

    const links = [];
    if (process.env.SUPPORT_SERVER) links.push(`[Support server](${process.env.SUPPORT_SERVER})`);
    if (process.env.INVITE_URL) links.push(`[Add to your server](${process.env.INVITE_URL})`);

    await interaction.reply(message(box(
      withPicture(`**Rae — Commands**\n${small('A fast, lightweight Discord music bot. Use \`/play\` to get started.')}`, client.user.displayAvatarURL()),
      sections.join('\n\n'),
      links.join(' · '),
      `-# ${client.guilds.cache.size} servers`,
    )));
  },
};
