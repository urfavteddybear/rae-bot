import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from 'discord.js';
import { requirePlayer, replyError, truncate, msToTime } from '../../utils/embeds.js';

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

    if (!player.queue.current && !player.queue.tracks.length) {
      return replyError(interaction, 'The queue is empty.');
    }

    let currentPage = (interaction.options.getInteger('page') ?? 1) - 1;

    const buildQueueState = (page) => {
      const currentPlayer = client.lavalink.getPlayer(interaction.guildId);
      if (!currentPlayer) return null;

      const tracks = currentPlayer.queue.tracks;
      const current = currentPlayer.queue.current;
      const totalPages = Math.max(1, Math.ceil(tracks.length / PAGE_SIZE));
      const safePage = Math.min(Math.max(0, page), totalPages - 1);

      const slice = tracks.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
      const queueList = slice.length
        ? slice.map((t, i) =>
            `\`${safePage * PAGE_SIZE + i + 1}.\` **[${truncate(t.info.title, 40)}](${t.info.uri})** — ${truncate(t.info.author, 25)} \`${msToTime(t.info.duration)}\``
          ).join('\n')
        : '*No upcoming tracks.*';

      const totalDuration = tracks.reduce((acc, t) => acc + (t.info.duration ?? 0), 0);

      const embed = new EmbedBuilder()
        .setColor(parseInt(process.env.ACCENT_COLOR ?? '5865F2', 16))
        .setTitle('📋  Queue')
        .setDescription(
          `**Now Playing:**\n🎵 [${truncate(current?.info?.title ?? 'Nothing', 50)}](${current?.info?.uri ?? '#'}) — ${current?.info?.author ?? ''}\n\n**Up Next:**\n${queueList}`
        )
        .setFooter({ text: `Page ${safePage + 1}/${totalPages} • ${tracks.length} tracks • Total: ${msToTime(totalDuration)}` });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('queue_first')
          .setLabel('⏮')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(safePage === 0),
        new ButtonBuilder()
          .setCustomId('queue_prev')
          .setLabel('◀')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(safePage === 0),
        new ButtonBuilder()
          .setCustomId('queue_next')
          .setLabel('▶')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(safePage >= totalPages - 1),
        new ButtonBuilder()
          .setCustomId('queue_last')
          .setLabel('⏭')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(safePage >= totalPages - 1),
      );

      return { embed, row, totalPages, safePage };
    };

    const initial = buildQueueState(currentPage);
    if (!initial) {
      return replyError(interaction, 'The queue is empty.');
    }

    const payload = {
      embeds: [initial.embed],
      components: initial.totalPages > 1 ? [initial.row] : [],
    };

    const replyMsg = await interaction.reply({ ...payload, fetchReply: true });

    if (initial.totalPages <= 1) return;

    const collector = replyMsg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      idle: 60_000,
    });

    collector.on('collect', async (btn) => {
      if (btn.user.id !== interaction.user.id) {
        return btn.reply({
          content: 'Only the user who used `/queue` can navigate this menu.',
          ephemeral: true,
        });
      }

      if (btn.customId === 'queue_first') currentPage = 0;
      else if (btn.customId === 'queue_prev') currentPage = Math.max(0, currentPage - 1);
      else if (btn.customId === 'queue_next') currentPage++;
      else if (btn.customId === 'queue_last') currentPage = 999999;

      const state = buildQueueState(currentPage);
      if (!state) {
        collector.stop();
        return btn.update({
          content: 'The queue has ended.',
          embeds: [],
          components: [],
        });
      }

      currentPage = state.safePage;

      await btn.update({
        embeds: [state.embed],
        components: state.totalPages > 1 ? [state.row] : [],
      });
    });

    collector.on('end', () => {
      replyMsg.edit({ components: [] }).catch(() => {});
    });
  },
};
