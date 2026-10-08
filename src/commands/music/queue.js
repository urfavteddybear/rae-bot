import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { requirePlayer, replyError, embed, truncate, msToTime } from '../../utils/embeds.js';

const PAGE_SIZE = 10;

export default {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('View the current queue')
    .addIntegerOption(o => o
      .setName('page')
      .setDescription('Page number')
      .setMinValue(1)),

  async execute(interaction, client) {
    const player = await requirePlayer(interaction);
    if (!player) return;

    const tracks = player.queue.tracks;
    const current = player.queue.current;

    if (!current && !tracks.length) {
      return replyError(interaction, 'The queue is empty.');
    }

    const page = (interaction.options.getInteger('page') ?? 1) - 1;
    const totalPages = Math.max(1, Math.ceil(tracks.length / PAGE_SIZE));

    if (page >= totalPages && totalPages > 0) {
      return replyError(interaction, `There are only **${totalPages}** page(s).`);
    }

    const slice = tracks.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    const queueList = slice.length
      ? slice.map((t, i) =>
          `\`${page * PAGE_SIZE + i + 1}.\` **[${truncate(t.info.title, 40)}](${t.info.uri})** — ${truncate(t.info.author, 25)} \`${msToTime(t.info.duration)}\``
        ).join('\n')
      : '*No upcoming tracks.*';

    const totalDuration = tracks.reduce((acc, t) => acc + (t.info.duration ?? 0), 0);

    const e = new EmbedBuilder()
      .setColor(parseInt(process.env.ACCENT_COLOR ?? '5865F2', 16))
      .setTitle('📋  Queue')
      .setDescription(
        `**Now Playing:**\n🎵 [${truncate(current?.info?.title ?? 'Nothing', 50)}](${current?.info?.uri ?? '#'}) — ${current?.info?.author ?? ''}\n\n**Up Next:**\n${queueList}`
      )
      .setFooter({ text: `Page ${page + 1}/${totalPages} • ${tracks.length} tracks • Total: ${msToTime(totalDuration)}` });

    await interaction.reply({ embeds: [e] });
  },
};
