/**
 * One-time command deployment script.
 * Run: node src/deploy-commands.js
 * This registers all slash commands globally (or to a specific guild for testing).
 */
import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const commands = [];

const commandsPath = join(__dirname, 'commands');
for (const category of readdirSync(commandsPath)) {
  for (const file of readdirSync(join(commandsPath, category)).filter(f => f.endsWith('.js'))) {
    const mod = await import(pathToFileURL(join(commandsPath, category, file)).href);
    const cmd = mod.default ?? mod;
    if (cmd?.data) commands.push(cmd.data.toJSON());
  }
}

const rest = new REST().setToken(process.env.BOT_TOKEN);

const target = process.env.GUILD_ID
  ? Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)
  : Routes.applicationCommands(process.env.CLIENT_ID);

const scope = process.env.GUILD_ID ? `guild ${process.env.GUILD_ID}` : 'globally';

console.log(`Deploying ${commands.length} commands ${scope}…`);
await rest.put(target, { body: commands });
console.log(`✅  Successfully deployed ${commands.length} commands ${scope}.`);
