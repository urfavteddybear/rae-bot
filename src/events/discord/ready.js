import { ActivityType } from 'discord.js';
import { log } from '../../utils/logger.js';
import { getDb } from '../../utils/database.js';

export default {
  name: 'clientReady',   // renamed from 'ready' (deprecated in djs v14.15+)
  once: true,
  async execute(readyClient, client) {
    // readyClient === client (both are the same object; djs passes it as arg)
    const c = client ?? readyClient;

    log.info(`Logged in as ${c.user.tag} — serving ${c.guilds.cache.size} guilds`);

    c.user.setPresence({
      activities: [{ name: '/play • music', type: ActivityType.Listening }],
      status: 'online',
    });

    // Connect Lavalink nodes
    await c.lavalink.init({ id: c.user.id, username: c.user.username });

    // Restore 24/7 guilds — handled by voiceStateUpdate on next activity
    const db = getDb();
    const rows = db.prepare('SELECT id FROM guilds WHERE stay247 = 1').all();
    if (rows.length) log.info(`[247] ${rows.length} guild(s) have 24/7 mode enabled`);
  },
};
