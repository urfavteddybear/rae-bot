import { log } from '../../utils/logger.js';
import { replyError } from '../../utils/embeds.js';

const COOLDOWN_MS = 3000;

export default {
  name: 'interactionCreate',
  once: false,
  async execute(interaction, client) {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

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
      log.error(`Command ${command.data.name} threw: ${err.message}`);
      await replyError(interaction, 'An unexpected error occurred. Please try again.');
    }
  },
};
