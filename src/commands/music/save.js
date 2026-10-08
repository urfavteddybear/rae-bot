import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { requirePlaying, replyError, truncate } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('save')
    .setDescription('Send the current track to your DMs'),

  async execute(interaction, client) {
    const player = await requirePlaying(interaction);
    if (!player) return;

    const track = player.queue.current;
    const e = new EmbedBuilder()
      .setColor(parseInt(process.env.ACCENT_COLOR ?? '5865F2', 16))
      .setTitle(`🎵  ${truncate(track.info.title, 60)}`)
      .setURL(track.info.uri ?? null)
      .setThumbnail(track.info.artworkUrl ?? null)
      .addFields(
        { name: 'Artist', value: track.info.author ?? 'Unknown', inline: true },
        { name: 'Server', value: interaction.guild.name, inline: true },
      )
      .setFooter({ text: `Saved by ${interaction.user.tag}` });

    try {
      await interaction.user.send({ embeds: [e] });
      await interaction.reply({ content: '📬  Track sent to your DMs!', ephemeral: true });
    } catch {
      await interaction.reply({ content: '❌  I cannot DM you. Please enable DMs from server members.', ephemeral: true });
    }
  },
};
