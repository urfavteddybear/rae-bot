import { SlashCommandBuilder } from 'discord.js';
import { say, small } from '../../utils/ui.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Show bot and API latency'),

  async execute(interaction, client) {
    const sent = await interaction.deferReply({ fetchReply: true });
    const apiPing = client.ws.ping;
    const botPing = sent.createdTimestamp - interaction.createdTimestamp;

    await interaction.editReply(say(`**Pong**\n${small(`Bot ${botPing}ms · API ${apiPing}ms`)}`));
  },
};
