import { SlashCommandBuilder } from 'discord.js';
import { requirePlayer, replyError, replySuccess } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('loop')
    .setDescription('Set the loop mode')
    .addStringOption(o => o
      .setName('mode')
      .setDescription('Loop mode')
      .setRequired(true)
      .addChoices(
        { name: 'Off',   value: 'off' },
        { name: 'Track', value: 'track' },
        { name: 'Queue', value: 'queue' },
      )),

  async execute(interaction, client) {
    const player = await requirePlayer(interaction);
    if (!player) return;

    const mode = interaction.options.getString('mode', true);
    player.setRepeatMode(mode);

    const labels = { off: 'Off', track: 'Track', queue: 'Queue' };
    await replySuccess(interaction, `Loop mode set to **${labels[mode]}**.`);
  },
};
