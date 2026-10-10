import { SlashCommandBuilder } from 'discord.js';
import { replyError, embed } from '../../utils/embeds.js';
import { applyStay247, getStay247 } from '../../utils/stay247.js';

export default {
  data: new SlashCommandBuilder()
    .setName('247')
    .setDescription('Toggle 24/7 mode: the bot stays in the voice channel even when nothing is playing'),

  async execute(interaction, client) {
    const player = client.lavalink.getPlayer(interaction.guildId);
    const memberVoice = interaction.member?.voice?.channel;

    if (!player && !memberVoice) {
      return replyError(interaction, 'You or the bot must be in a voice channel to toggle 24/7 mode.');
    }

    if (player && memberVoice?.id !== player.voiceChannelId) {
      return replyError(interaction, `Join <#${player.voiceChannelId}> to change 24/7 mode.`);
    }

    const enable = !getStay247(interaction.guildId);

    await applyStay247(client, interaction.guildId, enable, {
      voiceChannelId: memberVoice?.id,
      textChannelId: interaction.channelId,
    });

    if (enable) {
      return interaction.reply({
        embeds: [
          embed(
            '**24/7 mode enabled.** The bot stays in the voice channel even when nothing is playing (resets when the bot restarts).',
            0x57f287,
          ),
        ],
      });
    }

    return interaction.reply({
      embeds: [
        embed(
          '**24/7 mode disabled.** The bot leaves when the queue ends or the channel is empty.',
          0xed4245,
        ),
      ],
    });
  },
};
