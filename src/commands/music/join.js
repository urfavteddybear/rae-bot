import { SlashCommandBuilder } from 'discord.js';
import { requireVoice, replyError, replySuccess } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('join')
    .setDescription('Make the bot join your voice channel'),

  async execute(interaction, client) {
    const vc = await requireVoice(interaction);
    if (!vc) return;

    let player = client.lavalink.getPlayer(interaction.guildId);
    if (player?.voiceChannelId === vc.channel.id) {
      return replyError(interaction, 'I am already in your voice channel.');
    }

    if (!player) {
      player = await client.lavalink.createPlayer({
        guildId:        interaction.guildId,
        voiceChannelId: vc.channel.id,
        textChannelId:  interaction.channelId,
        selfDeaf:       true,
        volume:         100,
      });
    } else {
      player.voiceChannelId = vc.channel.id;
      player.options.voiceChannelId = vc.channel.id;
      player.textChannelId = interaction.channelId;
    }

    await player.connect();
    await replySuccess(interaction, `Joined **${vc.channel.name}**.`);
  },
};
