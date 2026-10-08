import { SlashCommandBuilder } from 'discord.js';
import { requirePlaying, replyError, replySuccess, truncate } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('replay')
    .setDescription('Restart the current track from the beginning'),

  async execute(interaction, client) {
    const player = await requirePlaying(interaction);
    if (!player) return;

    await player.seek(0);
    await replySuccess(interaction, `Replaying **${truncate(player.queue.current.info.title)}**.`);
  },
};
