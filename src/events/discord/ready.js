import { ActivityType } from 'discord.js';
import { log } from '../../utils/logger.js';
import { getDb } from '../../utils/database.js';

export default {
  name: 'clientReady',
  once: true,
  async execute(readyClient, client) {
    const c = client ?? readyClient;

    log.info(`Logged in as ${c.user.tag} — serving ${c.guilds.cache.size} guilds`);

    c.user.setPresence({
      activities: [{ name: '/play • music', type: ActivityType.Listening }],
      status: 'online',
    });

    // Connect Lavalink nodes
    await c.lavalink.init({ id: c.user.id, username: c.user.username });

    // Restore 24/7 guilds
    const db = getDb();
    const rows = db.prepare('SELECT id, voice_channel_id, text_channel_id FROM guilds WHERE stay247 = 1').all();
    if (rows.length) {
      log.info(`[247] Restoring connection for ${rows.length} guild(s)...`);
      for (const row of rows) {
        if (!row.voice_channel_id) continue;
        const guild = c.guilds.cache.get(row.id);
        if (!guild) continue;
        const vc = guild.channels.cache.get(row.voice_channel_id);
        if (!vc) continue;

        try {
          let player = c.lavalink.getPlayer(row.id);
          if (!player) {
            player = await c.lavalink.createPlayer({
              guildId: row.id,
              voiceChannelId: row.voice_channel_id,
              textChannelId: row.text_channel_id || null,
              selfDeaf: true,
              volume: 80,
            });
          }
          await player.connect();
          log.info(`[247] Reconnected to "${vc.name}" in ${guild.name}`);
        } catch (err) {
          log.warn(`[247] Failed to reconnect in ${guild.name}: ${err.message}`);
        }
      }
    }
  },
};
