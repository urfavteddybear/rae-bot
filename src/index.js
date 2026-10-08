import 'dotenv/config';
import { Client, GatewayIntentBits, Collection, ActivityType } from 'discord.js';
import { LavalinkManager } from 'lavalink-client';
import { loadCommands } from './handlers/commandHandler.js';
import { loadEvents } from './handlers/eventHandler.js';
import { initDatabase } from './utils/database.js';
import { log } from './utils/logger.js';

// ── Validate required env vars ─────────────────────────────────────────────
const required = ['BOT_TOKEN', 'CLIENT_ID', 'LAVALINK_NODES'];
for (const key of required) {
  if (!process.env[key]) {
    log.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

// ── Discord Client ─────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
  ],
  allowedMentions: { parse: ['users'], repliedUser: false },
});

client.commands = new Collection();
client.cooldowns = new Collection();

// ── Lavalink ───────────────────────────────────────────────────────────────
let nodes;
try {
  nodes = JSON.parse(process.env.LAVALINK_NODES);
} catch {
  log.error('LAVALINK_NODES is not valid JSON. See .env.example for format.');
  process.exit(1);
}

client.lavalink = new LavalinkManager({
  nodes,
  sendToShard: (guildId, payload) => {
    const guild = client.guilds.cache.get(guildId);
    if (guild?.shard) {
      guild.shard.send(payload);
    } else {
      client.ws.shards.first()?.send(payload);
    }
  },
  autoSkip: true,
  client: {
    id: process.env.CLIENT_ID,
    username: 'Rae',
  },
  playerOptions: {
    applyVolumeAsFilter: false,
    clientBasedPositionUpdateInterval: 50,
    defaultSearchPlatform: process.env.DEFAULT_SEARCH_ENGINE ?? 'dzsearch',
    onDisconnect: { destroyPlayer: false, autoReconnect: true },
    onEmptyQueue: { destroyAfterMs: 30_000 },
  },
  queueOptions: {
    maxPreviousTracks: 25,
  },
});

// ── Raw Gateway Forwarding ─────────────────────────────────────────────────
client.on('raw', (data) => client.lavalink.sendRawData(data));

// ── Database ───────────────────────────────────────────────────────────────
initDatabase();

// ── Load handlers ──────────────────────────────────────────────────────────
await loadCommands(client);
await loadEvents(client);

// ── Login ──────────────────────────────────────────────────────────────────
await client.login(process.env.BOT_TOKEN);

export { client };
