import { SlashCommandBuilder } from 'discord.js';
import { replyError, embed } from '../../utils/embeds.js';
import { setStay247, getStay247 } from '../../utils/database.js';

export default {
  data: new SlashCommandBuilder()
    .setName('247')
    .setDescription('Toggle 24/7 mode — bot stays in voice channel indefinitely'),

  async execute(interaction, client) {
    let player = client.lavalink.getPlayer(interaction.guildId);
    const memberVoice = interaction.member?.voice?.channel;

    if (!player && !memberVoice) {
      return replyError(interaction, 'You or the bot must be in a voice channel to toggle 24/7 mode.');
    }

    const current = getStay247(interaction.guildId);
    const newVal = !current;

    if (newVal) {
      const voiceChannelId = player?.voiceChannelId ?? memberVoice.id;
      const textChannelId = player?.textChannelId ?? interaction.channelId;

      if (!player) {
        player = await client.lavalink.createPlayer({
          guildId: interaction.guildId,
          voiceChannelId,
          textChannelId,
          selfDeaf: true,
          volume: 80,
        });
        await player.connect();
      }

      player.options.onDisconnect = {
        destroyPlayer: false,
        autoReconnect: true,
      };

      setStay247(interaction.guildId, true, voiceChannelId, textChannelId);

      return interaction.reply({
        embeds: [
          embed(
            '**24/7 mode enabled.** The bot will stay in voice and reconnect automatically on restart.',
            0x57f287,
          ),
        ],
      });
    }

    if (player) {
      player.options.onDisconnect = {
        destroyPlayer: true,
        autoReconnect: false,
      };
    }

    setStay247(interaction.guildId, false);

    return interaction.reply({
      embeds: [
        embed(
          '**24/7 mode disabled.** The bot will leave when the queue ends.',
          0xed4245,
        ),
      ],
    });
  },
};
