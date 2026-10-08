import { SlashCommandBuilder } from 'discord.js';
import { requirePlayer, replyError, replySuccess, truncate } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('move')
    .setDescription('Move a track to a different position in the queue')
    .addIntegerOption(o => o
      .setName('from')
      .setDescription('Current position of the track')
      .setRequired(true)
      .setMinValue(1))
    .addIntegerOption(o => o
      .setName('to')
      .setDescription('New position for the track')
      .setRequired(true)
      .setMinValue(1)),

  async execute(interaction, client) {
    const player = await requirePlayer(interaction);
    if (!player) return;

    const from = interaction.options.getInteger('from', true) - 1;
    const to   = interaction.options.getInteger('to',   true) - 1;
    const len  = player.queue.tracks.length;

    if (from >= len) return replyError(interaction, `Position **${from + 1}** is out of range (queue has **${len}** tracks).`);
    if (to   >= len) return replyError(interaction, `Position **${to   + 1}** is out of range (queue has **${len}** tracks).`);
    if (from === to)  return replyError(interaction, 'The **from** and **to** positions are the same.');

    const [track] = player.queue.tracks.splice(from, 1);
    player.queue.tracks.splice(to, 0, track);
    await replySuccess(interaction, `↕️  Moved **${truncate(track.info.title)}** from position **${from + 1}** to **${to + 1}**.`);
  },
};
