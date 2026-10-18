import { SlashCommandBuilder } from 'discord.js';
import { box, message, quiet, requirePlaying, trackLink, truncate, withPicture } from '../../utils/ui.js';

export default {
  data: new SlashCommandBuilder()
    .setName('save')
    .setDescription('Send the current track to your DMs'),

  async execute(interaction, client) {
    const player = await requirePlaying(interaction);
    if (!player) return;

    const track = player.queue.current;
    const card = box(
      withPicture(`**${trackLink(track.info)}** — ${truncate(track.info.author, 30)}`, track.info.artworkUrl),
      `-# Saved from ${interaction.guild.name}`,
    );

    try {
      await interaction.user.send(message(card));
      await interaction.reply(quiet('Track sent to your DMs.'));
    } catch {
      await interaction.reply(quiet('Cannot send direct messages. Please enable DMs from server members.'));
    }
  },
};
