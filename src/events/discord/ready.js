import { ActivityType } from 'discord.js';
import { log } from '../../utils/logger.js';
import { getDb } from '../../utils/database.js';

export default {
  name: 'ready',
  once: true,
  async execute(client) {
    log.info(`Logged in as ${client.user.tag} — serving ${client.guilds.cache.size} guilds`);

    client.user.setPresence({
      activities: [{ name: '/play • music', type: ActivityType.Listening }],
      status: 'online',
    });

    // Connect Lavalink nodes
    await client.lavalink.init({ id: client.user.id, username: client.user.username });

    // Restore 24/7 players (players where stay247=1)
    const db = getDb();
    const rows = db.prepare('SELECT id FROM guilds WHERE stay247 = 1').all();
    for (const row of rows) {
      const guild = client.guilds.cache.get(row.id);
      if (!guild) continue;
      // attempt to find voice channel from existing player info stored
      // We'll rejoin on next voice state update if needed
      log.debug(`24/7 guild ${row.id} will auto-rejoin on activity`);
    }
  },
};
