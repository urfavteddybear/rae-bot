import { SlashCommandBuilder } from 'discord.js';
import { requirePlaying, replyError, replySuccess, truncate } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skip the current track or skip multiple songs ahead')
    .addIntegerOption(o => o
      .setName('to')
      .setDescription('Number of tracks to skip ahead')
      .setMinValue(1)),

  async execute(interaction, client) {
    const player = await requirePlaying(interaction);
    if (!player) return;

    const to = interaction.options.getInteger('to');
    const title = player.queue.current?.info?.title ?? 'Unknown';

    // ── Multi-track skip ────────────────────────────────────────────────
    if (to && to > 1) {
      const upcomingCount = player.queue.tracks.length;
      if (to > upcomingCount + 1) {
        return replyError(
          interaction,
          `Cannot skip **${to}** tracks — the queue only has **${upcomingCount}** upcoming track(s).`
        );
      }
      try {
        await player.skip(to, false);
        return replySuccess(interaction, `Skipped **${to}** tracks.`);
      } catch (err) {
        return replyError(interaction, `Could not skip tracks: ${err.message}`);
      }
    }

    // ── Single-track skip ───────────────────────────────────────────────
    if (!player.queue.tracks.length) {
      try {
        await player.skip(0, false);
      } catch {
        await player.stopPlaying(true, false);
      }
      return replySuccess(interaction, `Skipped **${truncate(title, 40)}**. No more tracks in queue.`);
    }

    try {
      await player.skip();
      return replySuccess(interaction, `Skipped **${truncate(title, 40)}**.`);
    } catch (err) {
      if (err.message?.includes("Can't skip more than the queue size")) {
        return replyError(interaction, 'There are no more tracks in the queue to skip to.');
      }
      return replyError(interaction, `Could not skip track: ${err.message}`);
    }
  },
};
