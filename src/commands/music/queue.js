import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from 'discord.js';
import { box, message, quiet, small, requirePlayer, replyError, say, trackLink, truncate, msToTime } from '../../utils/ui.js';

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
            `\`${safePage * PAGE_SIZE + i + 1}.\` **${trackLink(t.info, 40)}** — ${truncate(t.info.author, 25)} \`${msToTime(t.info.duration)}\``
          ).join('\n')
        : '*No upcoming tracks.*';

      const totalDuration = tracks.reduce((acc, t) => acc + (t.info.duration ?? 0), 0);

      const nowPlaying = current
        ? `${trackLink(current.info, 50)} — ${truncate(current.info.author, 30)}`
        : 'Nothing';
      const card = box(
        `${small('Now playing')}\n${nowPlaying}\n\n${small('Up next')}\n${queueList}`,
        `-# Page ${safePage + 1}/${totalPages} • ${tracks.length} tracks • Total: ${msToTime(totalDuration)}`,
      );

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

      return { card, row, totalPages, safePage };
    };

    const initial = buildQueueState(currentPage);
    if (!initial) {
      return replyError(interaction, 'The queue is empty.');
    }

    const view = (state) => message(state.card, state.totalPages > 1 ? state.row : []);

    const replyMsg = await interaction.reply({ ...view(initial), fetchReply: true });

    if (initial.totalPages <= 1) return;

    let lastCard = initial.card;

    const collector = replyMsg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      idle: 60_000,
    });

    collector.on('collect', async (btn) => {
      if (btn.user.id !== interaction.user.id) {
        return btn.reply(quiet('Only the user who used `/queue` can navigate this menu.'));
      }

      if (btn.customId === 'queue_first') currentPage = 0;
      else if (btn.customId === 'queue_prev') currentPage = Math.max(0, currentPage - 1);
      else if (btn.customId === 'queue_next') currentPage++;
      else if (btn.customId === 'queue_last') currentPage = 999999;

      const state = buildQueueState(currentPage);
      if (!state) {
        collector.stop();
        return btn.update(say('The queue has ended.'));
      }

      currentPage = state.safePage;

      lastCard = state.card;
      await btn.update(view(state));
    });

    collector.on('end', () => {
      replyMsg.edit(message(lastCard)).catch(() => {});
    });
  },
};
