import { MessageFlags } from 'discord.js';
import { log } from '../../utils/logger.js';
import { replyError } from '../../utils/embeds.js';
import { handleNowPlayingButton, isNowPlayingButton } from '../../utils/nowPlayingControls.js';

const COOLDOWN_MS = 3000;

export default {
  name: 'interactionCreate',
  once: false,
  async execute(interaction, client) {
    // Buttons under the Now Playing message (other buttons are handled by their own collectors)
    if (isNowPlayingButton(interaction)) {
      if (!interaction.inGuild()) return;
      return handleNowPlayingButton(interaction, client);
    }

    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    if (!interaction.inGuild()) {
      return interaction.reply({ content: 'Commands only work inside a server.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }

    // ── Per-command cooldown ────────────────────────────────────────────
    if (!client.cooldowns.has(command.data.name)) {
      client.cooldowns.set(command.data.name, new Map());
    }
    const timestamps = client.cooldowns.get(command.data.name);
    const cooldown = (command.cooldown ?? 3) * 1000;
    const now = Date.now();

    if (timestamps.has(interaction.user.id)) {
      const expiry = timestamps.get(interaction.user.id) + cooldown;
      if (now < expiry) {
        const left = ((expiry - now) / 1000).toFixed(1);
        return replyError(interaction, `Please wait **${left}s** before using this command again.`);
      }
    }

    timestamps.set(interaction.user.id, now);
    setTimeout(() => timestamps.delete(interaction.user.id), cooldown);

    // ── Execute ─────────────────────────────────────────────────────────
    try {
      await command.execute(interaction, client);
    } catch (err) {
      // Full details go to the log only; internal error text can contain hosts or tokens.
      log.error(`Command ${command.data.name} threw: ${err.stack ?? err.message}`);

      let message = 'Something went wrong. Please try again.';
      if (err.message?.includes("Can't skip more than the queue size")) {
        message = 'There are no more tracks in the queue to skip to.';
      }

      try {
        await replyError(interaction, message);
      } catch {
        // ignore if interaction could not be replied to
      }
    }
  },
};
