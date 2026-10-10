/**
 * Buttons under the "Now Playing" message: previous, pause/resume, next, stop, and a link to the
 * dashboard. Button ids start with `np:` so they never clash with the buttons of other commands.
 */
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { log } from './logger.js';
import { nowPlayingEmbed } from './embeds.js';

const PREFIX = 'np:';
const PLAYER_EMOJI = 'airplay'; // name of the application emoji used on the "Open player" button

let playerEmoji = null;

/**
 * Look for an application emoji named "airplay" (upload assets/airplay.png in the Developer Portal,
 * under Emojis). Without it the "Open player" button simply has no icon.
 */
export async function loadPlayerEmoji(client) {
  try {
    const emojis = await client.application.emojis.fetch();
    const found = emojis.find((e) => e.name === PLAYER_EMOJI);
    playerEmoji = found ? { id: found.id, name: found.name, animated: !!found.animated } : null;
  } catch (err) {
    playerEmoji = null;
    log.warn(`Could not load application emojis: ${err.message}`);
  }
}

/** The dashboard address, or null when the dashboard isn't enabled. */
function dashboardUrl() {
  if (!process.env.CLIENT_SECRET) return null;
  const url = process.env.DASHBOARD_URL ?? `http://localhost:${process.env.WEB_PORT ?? 3000}`;
  return /^https?:\/\//.test(url) ? url : null;
}

/** Component rows for the Now Playing message. */
export function nowPlayingButtons(player) {
  // Plain text glyphs as labels, like the /queue buttons, so they match Discord's theme instead of showing coloured emoji.
  const button = (id, glyph) => new ButtonBuilder().setCustomId(`${PREFIX}${id}`).setLabel(glyph).setStyle(ButtonStyle.Secondary);

  const controls = new ActionRowBuilder().addComponents(
    button('prev', '⏮'),
    button('pause', player.paused ? '▶' : '⏸'),
    button('next', '⏭'),
    button('stop', '⏹'),
  );

  const rows = [controls];
  const url = dashboardUrl();
  if (url) {
    // A link button opens the dashboard in one click. Discord draws link buttons grey; only buttons that
    // trigger the bot can be blue, and those can't open a URL themselves.
    const open = new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(url).setLabel('Open player');
    if (playerEmoji) open.setEmoji(playerEmoji);
    rows.push(new ActionRowBuilder().addComponents(open));
  }
  return rows;
}

export const isNowPlayingButton = (interaction) => interaction.isButton() && interaction.customId.startsWith(PREFIX);

const ephemeral = (interaction, content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

/** Handle a click on one of the buttons above. Same rules as the commands: be in the bot's channel. */
export async function handleNowPlayingButton(interaction, client) {
  const action = interaction.customId.slice(PREFIX.length);

  const player = client.lavalink.getPlayer(interaction.guildId);

  if (!player?.queue.current) return ephemeral(interaction, 'There is nothing playing right now.');
  if (interaction.member?.voice?.channelId !== player.voiceChannelId) {
    return ephemeral(interaction, `Join <#${player.voiceChannelId}> to control the player.`);
  }

  try {
    switch (action) {
      case 'pause':
        if (player.paused) await player.resume();
        else await player.pause();
        // Refresh the message so the button and the status line match.
        return await interaction.update({ embeds: [nowPlayingEmbed(player)], components: nowPlayingButtons(player) });

      case 'next':
        await interaction.deferUpdate();
        if (player.queue.tracks.length) await player.skip();
        else await player.stopPlaying(true, false);
        return;

      case 'prev': {
        const previous = player.queue.previous[0];
        if (!previous) return await ephemeral(interaction, 'There are no previous tracks.');
        await interaction.deferUpdate();
        await player.queue.splice(0, 0, previous);
        await player.skip();
        return;
      }

      case 'stop':
        await interaction.deferUpdate();
        await player.stopPlaying(true, false);
        return;

      default:
        return await interaction.deferUpdate();
    }
  } catch (err) {
    log.warn(`Now Playing button "${action}" failed: ${err.message}`);
    if (!interaction.replied && !interaction.deferred) await ephemeral(interaction, 'Something went wrong. Please try again.').catch(() => {});
  }
}
