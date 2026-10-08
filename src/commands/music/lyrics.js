import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { requirePlaying, replyError, truncate } from '../../utils/embeds.js';

const LRCLIB_BASE = 'https://lrclib.net/api';
const ACCENT = parseInt(process.env.ACCENT_COLOR ?? '5865F2', 16);

/**
 * Query lrclib.net for lyrics.
 * Tries exact track_name + artist_name first, falls back to a plain text search.
 * Returns { plain, synced, trackName, artistName } or null.
 */
async function fetchLyrics(trackName, artistName) {
  // 1. Precise get
  const getUrl = new URL(`${LRCLIB_BASE}/get`);
  getUrl.searchParams.set('track_name', trackName);
  if (artistName) getUrl.searchParams.set('artist_name', artistName);

  const getRes = await fetch(getUrl, {
    headers: { 'User-Agent': 'RaeMusicBot/1.0 (https://github.com/yourname/rae)' },
    signal: AbortSignal.timeout(8000),
  });

  if (getRes.ok) {
    const data = await getRes.json();
    if (data?.plainLyrics || data?.syncedLyrics) {
      return {
        plain:       data.plainLyrics ?? null,
        synced:      data.syncedLyrics ?? null,
        trackName:   data.trackName ?? trackName,
        artistName:  data.artistName ?? artistName,
      };
    }
  }

  // 2. Fuzzy search fallback
  const searchUrl = new URL(`${LRCLIB_BASE}/search`);
  searchUrl.searchParams.set('q', `${trackName} ${artistName}`.trim());

  const searchRes = await fetch(searchUrl, {
    headers: { 'User-Agent': 'RaeMusicBot/1.0 (https://github.com/yourname/rae)' },
    signal: AbortSignal.timeout(8000),
  });

  if (searchRes.ok) {
    const results = await searchRes.json();
    const hit = results?.find?.(r => r.plainLyrics || r.syncedLyrics);
    if (hit) {
      return {
        plain:       hit.plainLyrics ?? null,
        synced:      hit.syncedLyrics ?? null,
        trackName:   hit.trackName ?? trackName,
        artistName:  hit.artistName ?? artistName,
      };
    }
  }

  return null;
}

/** Strip LRC timestamps like [01:23.45] and return plain text. */
function stripTimestamps(lrc) {
  return lrc.replace(/^\[[\d:.]+\]\s*/gm, '').trim();
}

/** Split text into ≤4000-char pages breaking on newlines. */
function paginate(text, maxLen = 3900) {
  const lines = text.split('\n');
  const pages = [];
  let page = '';
  for (const line of lines) {
    const candidate = page ? `${page}\n${line}` : line;
    if (candidate.length > maxLen) {
      if (page) pages.push(page.trim());
      page = line;
    } else {
      page = candidate;
    }
  }
  if (page.trim()) pages.push(page.trim());
  return pages.length ? pages : ['*(No lyrics text)*'];
}

export default {
  data: new SlashCommandBuilder()
    .setName('lyrics')
    .setDescription('Fetch lyrics for the current or a specific song')
    .addStringOption(o => o
      .setName('query')
      .setDescription('Song to search (e.g. "Blinding Lights - The Weeknd"). Defaults to current track.'))
    .addBooleanOption(o => o
      .setName('synced')
      .setDescription('Show time-synced LRC format instead of plain text (if available)')),

  async execute(interaction, client) {
    await interaction.deferReply();

    let trackName, artistName;

    const customQuery = interaction.options.getString('query');
    if (customQuery) {
      // Allow "Title - Artist" or just "Title"
      const parts = customQuery.split(/\s+-\s+/);
      trackName  = parts[0].trim();
      artistName = parts[1]?.trim() ?? '';
    } else {
      const player = await requirePlaying(interaction);
      if (!player) return;
      trackName  = player.queue.current.info.title;
      artistName = player.queue.current.info.author ?? '';
    }

    const wantSynced = interaction.options.getBoolean('synced') ?? false;

    // ── Fetch ──────────────────────────────────────────────────────────────
    let result = null;
    try {
      result = await fetchLyrics(trackName, artistName);
    } catch (err) {
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xed4245)
          .setDescription(`❌  Could not reach lrclib.net: \`${err.message}\``)],
      });
    }

    if (!result) {
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xfee75c)
          .setDescription(
            `⚠️  No lyrics found for **${truncate(trackName, 40)}**${artistName ? ` by **${truncate(artistName, 30)}**` : ''}.\n\n` +
            `Try specifying the song with \`/lyrics query:Song Title - Artist Name\`.`
          )],
      });
    }

    // ── Pick text ──────────────────────────────────────────────────────────
    let lyricsText;
    let sourceLabel = 'lrclib.net';
    if (wantSynced && result.synced) {
      lyricsText  = result.synced;
      sourceLabel = 'lrclib.net (LRC)';
    } else {
      // Prefer plain, fall back to stripping timestamps from synced
      lyricsText = result.plain ?? stripTimestamps(result.synced ?? '');
    }

    const pages = paginate(lyricsText);
    const title = `📜  ${truncate(result.trackName, 45)}${result.artistName ? ` — ${truncate(result.artistName, 30)}` : ''}`;

    // ── Single page — no buttons needed ───────────────────────────────────
    if (pages.length === 1) {
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(ACCENT)
          .setTitle(title)
          .setDescription(pages[0])
          .setFooter({ text: `Source: ${sourceLabel}` })],
      });
    }

    // ── Multi-page with Prev / Next buttons ────────────────────────────────
    let currentPage = 0;

    const buildEmbed = (page) =>
      new EmbedBuilder()
        .setColor(ACCENT)
        .setTitle(title)
        .setDescription(pages[page])
        .setFooter({ text: `Page ${page + 1}/${pages.length} • Source: ${sourceLabel}` });

    const buildRow = (page) =>
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('lyrics_prev')
          .setLabel('◀')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === 0),
        new ButtonBuilder()
          .setCustomId('lyrics_next')
          .setLabel('▶')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === pages.length - 1),
      );

    const msg = await interaction.editReply({
      embeds: [buildEmbed(currentPage)],
      components: [buildRow(currentPage)],
    });

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: b => b.user.id === interaction.user.id,
      idle: 120_000,
    });

    collector.on('collect', async (btn) => {
      if (btn.customId === 'lyrics_prev') currentPage = Math.max(0, currentPage - 1);
      if (btn.customId === 'lyrics_next') currentPage = Math.min(pages.length - 1, currentPage + 1);
      await btn.update({
        embeds: [buildEmbed(currentPage)],
        components: [buildRow(currentPage)],
      });
    });

    collector.on('end', () => {
      msg.edit({ components: [] }).catch(() => {});
    });
  },
};
