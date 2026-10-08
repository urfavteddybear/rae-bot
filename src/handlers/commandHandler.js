import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { log } from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function loadCommands(client) {
  const commandsPath = join(__dirname, '..', 'commands');
  const categories = readdirSync(commandsPath);

  for (const category of categories) {
    const files = readdirSync(join(commandsPath, category)).filter(f => f.endsWith('.js'));
    for (const file of files) {
      const filePath = pathToFileURL(join(commandsPath, category, file)).href;
      const cmd = await import(filePath);
      const command = cmd.default ?? cmd;
      if (!command?.data?.name) {
        log.warn(`Command file ${file} is missing data.name — skipping`);
        continue;
      }
      client.commands.set(command.data.name, command);
    }
  }

  log.info(`Loaded ${client.commands.size} commands`);
}
