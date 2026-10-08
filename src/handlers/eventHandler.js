import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { log } from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function loadEvents(client) {
  // Discord.js events
  const discordEventsPath = join(__dirname, '..', 'events', 'discord');
  for (const file of readdirSync(discordEventsPath).filter(f => f.endsWith('.js'))) {
    const event = (await import(pathToFileURL(join(discordEventsPath, file)).href)).default;
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, client));
    } else {
      client.on(event.name, (...args) => event.execute(...args, client));
    }
  }

  // Lavalink events
  const lavalinkEventsPath = join(__dirname, '..', 'events', 'lavalink');
  for (const file of readdirSync(lavalinkEventsPath).filter(f => f.endsWith('.js'))) {
    const event = (await import(pathToFileURL(join(lavalinkEventsPath, file)).href)).default;
    if (event.emitter === 'node') {
      // Node-level events
      client.lavalink.nodeManager.on(event.name, (...args) => event.execute(...args, client));
    } else {
      client.lavalink.on(event.name, (...args) => event.execute(...args, client));
    }
  }

  log.info('Events loaded');
}
