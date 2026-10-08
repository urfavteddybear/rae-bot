import { SlashCommandBuilder } from 'discord.js';
import { requirePlayer, replyError, replySuccess } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('autoplay')
    .setDescription('Toggle autoplay — auto-queue related tracks when the queue empties'),

  async execute(interaction, client) {
    const player = await requirePlayer(interaction);
    if (!player) return;

    const current = player.get('autoplay') ?? false;
    player.set('autoplay', !current);
    await replySuccess(interaction, `🔀  Autoplay is now **${!current ? 'enabled' : 'disabled'}**.`);
  },
};
