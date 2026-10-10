import { SlashCommandBuilder } from 'discord.js';
import { requireVoice, requireJoinable, replyError, replySuccess, embed, truncate } from '../../utils/embeds.js';
import { MAX_QUEUE_SIZE, MAX_QUERY_LENGTH, isAllowedUrl } from '../../utils/limits.js';

const SEARCH_ENGINES = {
  deezer:      'dzsearch',
  spotify:     'spsearch',
  applemusic:  'amsearch',
  soundcloud:  'scsearch',
  youtube:     'ytsearch',
};

export default {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a song or playlist by name or URL')
    .addStringOption(o => o
      .setName('query')
      .setDescription('Song name, artist, or URL (Deezer/Spotify/Apple Music/YouTube/SoundCloud)')
      .setRequired(true))
    .addStringOption(o => o
      .setName('source')
      .setDescription('Search source (default: Deezer)')
      .addChoices(
        { name: 'Deezer',       value: 'deezer' },
        { name: 'Spotify',      value: 'spotify' },
        { name: 'Apple Music',  value: 'applemusic' },
        { name: 'SoundCloud',   value: 'soundcloud' },
        { name: 'YouTube',      value: 'youtube' },
      )),

  async execute(interaction, client) {
    await interaction.deferReply();

    const vc = await requireVoice(interaction);
    if (!vc) return;

    const rawQuery = interaction.options.getString('query', true).trim();
    if (rawQuery.length > MAX_QUERY_LENGTH) {
      return replyError(interaction, `Queries are limited to ${MAX_QUERY_LENGTH} characters.`);
    }
    const sourceKey = interaction.options.getString('source') ?? null;
    const searchPrefix = sourceKey
      ? SEARCH_ENGINES[sourceKey]
      : (process.env.DEFAULT_SEARCH_ENGINE ?? 'dzsearch');

    // Detect raw URLs — don't prefix them
    const isUrl = /^https?:\/\//i.test(rawQuery);
    if (isUrl && !isAllowedUrl(rawQuery)) {
      return replyError(interaction, 'That link is not from a supported music service.');
    }
    const query = isUrl ? rawQuery : `${searchPrefix}:${rawQuery}`;

    // ── Get or create player ────────────────────────────────────────────
    let player = client.lavalink.getPlayer(interaction.guildId);
    if (!(await requireJoinable(interaction, player, vc.channel))) return;
    if (!player) {
      player = await client.lavalink.createPlayer({
        guildId:       interaction.guildId,
        voiceChannelId: vc.channel.id,
        textChannelId:  interaction.channelId,
        selfDeaf:      true,
        volume:        100,
      });
    } else {
      if (player.voiceChannelId !== vc.channel.id) {
        player.voiceChannelId = vc.channel.id;
        player.options.voiceChannelId = vc.channel.id;
      }
      player.textChannelId = interaction.channelId;
    }

    if (!player.connected) {
      await player.connect();
    }

    // ── Search ──────────────────────────────────────────────────────────
    const res = await player.search({ query }, interaction.user);

    if (!res || res.loadType === 'error' || res.loadType === 'empty') {
      return replyError(interaction, `No results found for **${truncate(rawQuery)}**.`);
    }

    // ── Add to queue ────────────────────────────────────────────────────
    const room = MAX_QUEUE_SIZE - player.queue.tracks.length;
    if (room <= 0) {
      return replyError(interaction, `The queue is full (${MAX_QUEUE_SIZE} tracks).`);
    }

    if (res.loadType === 'playlist') {
      const tracks = res.tracks.slice(0, room);
      await player.queue.add(tracks);
      const capped = tracks.length < res.tracks.length ? ` (limited to ${tracks.length})` : '';
      await interaction.editReply({
        embeds: [embed(
          `Added playlist **${truncate(res.playlist?.name ?? 'Unknown', 40)}** — **${tracks.length}** tracks${capped}`,
        )],
      });
    } else {
      const track = res.tracks[0];
      await player.queue.add(track);
      await interaction.editReply({
        embeds: [embed(
          `Added **[${truncate(track.info.title)}](${track.info.uri})** by **${truncate(track.info.author, 30)}**`,
        )],
      });
    }

    if (!player.playing && !player.paused) {
      await player.play();
    }
  },
};
