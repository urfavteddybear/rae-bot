import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('invite')
    .setDescription('Get the bot invite link'),

  async execute(interaction, client) {
    const inviteUrl = process.env.INVITE_URL ||
      `https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=277293925376&scope=bot%20applications.commands`;

    const e = new EmbedBuilder()
      .setColor(parseInt(process.env.ACCENT_COLOR ?? '5865F2', 16))
      .setTitle('Invite Rae')
      .setDescription(`[Click here to invite me](${inviteUrl})`)
      .setThumbnail(client.user.displayAvatarURL());

    await interaction.reply({ embeds: [e] });
  },
};
