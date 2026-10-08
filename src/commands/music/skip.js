import { SlashCommandBuilder } from 'discord.js';
import { requirePlaying, replyError, replySuccess } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skip the current track'),

  async execute(interaction, client) {
    const player = await requirePlaying(interaction);
    if (!player) return;

    const title = player.queue.current?.info?.title ?? 'Unknown';
    await player.skip();
    await replySuccess(interaction, `Skipped **${title}**.`);
  },
};
