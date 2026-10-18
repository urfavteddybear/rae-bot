import { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder } from 'discord.js';
import { box, message, small, withPicture } from '../../utils/ui.js';

export default {
  data: new SlashCommandBuilder()
    .setName('invite')
    .setDescription('Get the bot invite link'),

  async execute(interaction, client) {
    const inviteUrl = process.env.INVITE_URL ||
      `https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=277293925376&scope=bot%20applications.commands`;

    const open = new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(inviteUrl).setLabel('Invite Rae');
    await interaction.reply(message(
      box(withPicture(`**Invite Rae**\n${small('Add the bot to your server.')}`, client.user.displayAvatarURL())),
      new ActionRowBuilder().addComponents(open),
    ));
  },
};
