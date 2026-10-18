import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { requireVoice, requireJoinable, message, replyError, say, box, small, trackLink, truncate, msToTime } from '../../utils/ui.js';
import { MAX_QUEUE_SIZE, MAX_QUERY_LENGTH } from '../../utils/limits.js';

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
    if (rawQuery.length > MAX_QUERY_LENGTH) {
      return replyError(interaction, `Queries are limited to ${MAX_QUERY_LENGTH} characters.`);
    }
    const sourceKey = interaction.options.getString('source') ?? null;
    const prefix = sourceKey ? SEARCH_ENGINES[sourceKey] : (process.env.DEFAULT_SEARCH_ENGINE ?? 'dzsearch');
    const query = `${prefix}:${rawQuery}`;

    let player = client.lavalink.getPlayer(interaction.guildId);
    if (!(await requireJoinable(interaction, player, vc.channel))) return;
    if (!player) {
      player = await client.lavalink.createPlayer({
        guildId:        interaction.guildId,
        voiceChannelId: vc.channel.id,
        textChannelId:  interaction.channelId,
        selfDeaf:       true,
        volume:         100,
      });
    } else {
      if (player.voiceChannelId !== vc.channel.id) {
        player.voiceChannelId = vc.channel.id;
        player.options.voiceChannelId = vc.channel.id;
      }
      player.textChannelId = interaction.channelId;
    }
    if (!player.connected) await player.connect();

    const res = await player.search({ query }, interaction.user);
    if (!res?.tracks?.length) {
      return replyError(interaction, `No results found for **${truncate(rawQuery)}**.`);
    }

    const results = res.tracks.slice(0, 5);
    const desc = results.map((t, i) =>
      `**${i + 1}.** ${trackLink(t.info, 45)} — ${t.info.author} \`${msToTime(t.info.duration)}\``
    ).join('\n');

    const buttons = results.map((_, i) =>
      new ButtonBuilder()
        .setCustomId(`search_${i}`)
        .setLabel(String(i + 1))
        .setStyle(ButtonStyle.Secondary)
    );

    const row = new ActionRowBuilder().addComponents(...buttons);
    const card = box(`${small(`Results for ${truncate(rawQuery, 80)}`)}\n${desc}`);
    const msg = await interaction.editReply(message(card, row));

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: b => b.user.id === interaction.user.id,
      time: 30_000,
      max: 1,
    });

    collector.on('collect', async (btn) => {
      const idx = parseInt(btn.customId.split('_')[1]);
      const track = results[idx];
      if (player.queue.tracks.length >= MAX_QUEUE_SIZE) {
        return btn.update(say(`The queue is full (${MAX_QUEUE_SIZE} tracks).`));
      }
      await player.queue.add(track);
      if (!player.playing && !player.paused) await player.play();
      await btn.update(say(`Added ${trackLink(track.info)} to the queue.`));
    });

    collector.on('end', (collected) => {
      if (collected.size === 0) {
        msg.edit(message(card)).catch(() => {});
      }
    });
  },
};
