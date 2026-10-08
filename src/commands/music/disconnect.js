import { SlashCommandBuilder } from 'discord.js';
import { requirePlayer, replyError, replySuccess } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('disconnect')
    .setDescription('Disconnect the bot and clear the queue'),

  async execute(interaction, client) {
    const player = await requirePlayer(interaction);
    if (!player) return;

    const prevMsg = player.get('nowPlayingMessage');
    if (prevMsg) {
      prevMsg.delete().catch(() => {});
      player.set('nowPlayingMessage', null);
    }

    await player.destroy();
    await replySuccess(interaction, 'Disconnected and cleared the queue.');
  },
};
