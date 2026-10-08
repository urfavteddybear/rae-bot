import { SlashCommandBuilder } from 'discord.js';
import { requireVoice, replyError, replySuccess, embed, truncate } from '../../utils/embeds.js';

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
    const sourceKey = interaction.options.getString('source') ?? null;
    const searchPrefix = sourceKey
      ? SEARCH_ENGINES[sourceKey]
      : (process.env.DEFAULT_SEARCH_ENGINE ?? 'dzsearch');

    // Detect raw URLs — don't prefix them
    const isUrl = /^https?:\/\//i.test(rawQuery);
    const query = isUrl ? rawQuery : `${searchPrefix}:${rawQuery}`;

    // ── Get or create player ────────────────────────────────────────────
    let player = client.lavalink.getPlayer(interaction.guildId);
    if (!player) {
      player = await client.lavalink.createPlayer({
        guildId:       interaction.guildId,
        voiceChannelId: vc.channel.id,
        textChannelId:  interaction.channelId,
        selfDeaf:      true,
        volume:        80,
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
    if (res.loadType === 'playlist') {
      await player.queue.add(res.tracks);
      await interaction.editReply({
        embeds: [embed(
          `📋  Added playlist **${truncate(res.playlist?.name ?? 'Unknown', 40)}** — **${res.tracks.length}** tracks`,
        )],
      });
    } else {
      const track = res.tracks[0];
      await player.queue.add(track);
      await interaction.editReply({
        embeds: [embed(
          `🎵  Added **[${truncate(track.info.title)}](${track.info.uri})** by **${truncate(track.info.author, 30)}**`,
        )],
      });
    }

    if (!player.playing && !player.paused) {
      await player.play();
    }
  },
};
