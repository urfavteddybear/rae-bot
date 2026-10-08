import { SlashCommandBuilder } from 'discord.js';
import { requirePlaying, replyError, embed, truncate } from '../../utils/embeds.js';
import { setStay247, getStay247 } from '../../utils/database.js';

export default {
  data: new SlashCommandBuilder()
    .setName('247')
    .setDescription('Toggle 24/7 mode — bot stays in voice channel indefinitely'),

  async execute(interaction, client) {
    const player = await requirePlaying(interaction);
    if (!player) return;

    const current = getStay247(interaction.guildId);
    const newVal = !current;
    setStay247(interaction.guildId, newVal);

    // Update player disconnect behaviour
    player.options.onDisconnect = {
      destroyPlayer: !newVal,
      autoReconnect: newVal,
    };

    await interaction.reply({
      embeds: [embed(
        newVal
          ? '🔒  **24/7 mode enabled.** I will stay in voice and auto-rejoin if disconnected.'
          : '🔓  **24/7 mode disabled.** I will leave after the queue ends.',
        newVal ? 0x57f287 : 0xed4245,
      )],
    });
  },
};
