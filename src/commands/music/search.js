import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { requireVoice, replyError, embed, truncate, msToTime } from '../../utils/embeds.js';

const SEARCH_ENGINES = {
  deezer:      'dzsearch',
  spotify:     'spsearch',
  applemusic:  'amsearch',
  soundcloud:  'scsearch',
  youtube:     'ytsearch',
};

export default {
  data: new SlashCommandBuilder()
    .setName('search')
    .setDescription('Search for a song and pick from results')
    .addStringOption(o => o
      .setName('query')
      .setDescription('Song name or artist')
      .setRequired(true))
    .addStringOption(o => o
      .setName('source')
      .setDescription('Search source (default: Deezer)')
      .addChoices(
        { name: 'Deezer',      value: 'deezer' },
        { name: 'Spotify',     value: 'spotify' },
        { name: 'Apple Music', value: 'applemusic' },
        { name: 'SoundCloud',  value: 'soundcloud' },
        { name: 'YouTube',     value: 'youtube' },
      )),

  async execute(interaction, client) {
    await interaction.deferReply();

    const vc = await requireVoice(interaction);
    if (!vc) return;

    const rawQuery = interaction.options.getString('query', true).trim();
    const sourceKey = interaction.options.getString('source') ?? null;
    const prefix = sourceKey ? SEARCH_ENGINES[sourceKey] : (process.env.DEFAULT_SEARCH_ENGINE ?? 'dzsearch');
    const query = `${prefix}:${rawQuery}`;

    let player = client.lavalink.getPlayer(interaction.guildId);
    if (!player) {
      player = await client.lavalink.createPlayer({
        guildId:        interaction.guildId,
        voiceChannelId: vc.channel.id,
        textChannelId:  interaction.channelId,
        selfDeaf:       true,
        volume:         80,
      });
    }
    if (!player.connected) await player.connect();

    const res = await player.search({ query }, interaction.user);
    if (!res?.tracks?.length) {
      return replyError(interaction, `No results found for **${truncate(rawQuery)}**.`);
    }

    const results = res.tracks.slice(0, 5);
    const desc = results.map((t, i) =>
      `**${i + 1}.** [${truncate(t.info.title, 45)}](${t.info.uri}) — ${t.info.author} \`${msToTime(t.info.duration)}\``
    ).join('\n');

    const buttons = results.map((_, i) =>
      new ButtonBuilder()
        .setCustomId(`search_${i}`)
        .setLabel(String(i + 1))
        .setStyle(ButtonStyle.Secondary)
    );

    const row = new ActionRowBuilder().addComponents(...buttons);
    const msg = await interaction.editReply({
      embeds: [embed(`🔍  **Search results for:** ${rawQuery}\n\n${desc}`)],
      components: [row],
    });

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: b => b.user.id === interaction.user.id,
      time: 30_000,
      max: 1,
    });

    collector.on('collect', async (btn) => {
      const idx = parseInt(btn.customId.split('_')[1]);
      const track = results[idx];
      await player.queue.add(track);
      if (!player.playing && !player.paused) await player.play();
      await btn.update({
        embeds: [embed(`🎵  Added **[${truncate(track.info.title)}](${track.info.uri})** to the queue.`)],
        components: [],
      });
    });

    collector.on('end', (collected) => {
      if (collected.size === 0) {
        msg.edit({ components: [] }).catch(() => {});
      }
    });
  },
};
