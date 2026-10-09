import { ActivityType } from 'discord.js';
import { log } from '../../utils/logger.js';

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
  },
};
