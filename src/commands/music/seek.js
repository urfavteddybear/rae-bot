import { SlashCommandBuilder } from 'discord.js';
import { requirePlaying, replyError, replySuccess, msToTime } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('seek')
    .setDescription('Seek to a specific position in the current track')
    .addStringOption(o => o
      .setName('position')
      .setDescription('Time to seek to (e.g. 1:30 or 90)')
      .setRequired(true)),

  async execute(interaction, client) {
    const player = await requirePlaying(interaction);
    if (!player) return;

    if (player.queue.current?.info?.isStream) {
      return replyError(interaction, 'Cannot seek in a live stream.');
    }

    const raw = interaction.options.getString('position', true).trim();
    let ms;

    // Accept "mm:ss", "hh:mm:ss", or plain seconds
    if (/^\d+:\d{2}(:\d{2})?$/.test(raw)) {
      const parts = raw.split(':').map(Number);
      if (parts.length === 2) ms = (parts[0] * 60 + parts[1]) * 1000;
      else ms = (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
    } else if (/^\d+$/.test(raw)) {
      ms = parseInt(raw) * 1000;
    } else {
      return replyError(interaction, 'Invalid format. Use `mm:ss`, `hh:mm:ss`, or seconds.');
    }

    const duration = player.queue.current.info.duration;
    if (ms < 0 || ms > duration) {
      return replyError(interaction, `Seek position must be between 0 and **${msToTime(duration)}**.`);
    }

    await player.seek(ms);
    await replySuccess(interaction, `⏩  Seeked to **${msToTime(ms)}**.`);
  },
};
