import 'dotenv/config';
import { Client, GatewayIntentBits, Collection, ActivityType, Options } from 'discord.js';
import { LavalinkManager } from 'lavalink-client';
import { loadCommands } from './handlers/commandHandler.js';
import { loadEvents } from './handlers/eventHandler.js';
import { getStay247 } from './utils/stay247.js';
import { log } from './utils/logger.js';
import { startWebServer } from './web/server.js';

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
  ],
  allowedMentions: { parse: ['users'], repliedUser: false },
  makeCache: Options.cacheWithLimits({
    MessageManager: 0,
    BaseGuildEmojiManager: 0,
    GuildEmojiManager: 0,
    GuildStickerManager: 0,
    GuildScheduledEventManager: 0,
    ReactionManager: 0,
    ReactionUserManager: 0,
    StageInstanceManager: 0,
    ThreadManager: 0,
    ThreadMemberManager: 0,
    PresenceManager: 0,
  }),
  sweepers: {
    users: { interval: 300, filter: () => user => user.id !== client.user?.id },
  },
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
    defaultVolume: 100,
    clientBasedPositionUpdateInterval: 150,
    defaultSearchPlatform: process.env.DEFAULT_SEARCH_ENGINE ?? 'dzsearch',
    onDisconnect: { destroyPlayer: false, autoReconnect: true },
    onEmptyQueue: { destroyAfterMs: 30_000 },
  },
  queueOptions: {
    maxPreviousTracks: 25,
  },
});

// ── Raw Gateway Forwarding ─────────────────────────────────────────────────
client.on('raw', (data) => {
  if (data.t === 'VOICE_SERVER_UPDATE' || data.t === 'VOICE_STATE_UPDATE') {
    client.lavalink.sendRawData(data);
  }
});

// ── 24/7 Empty Queue Guard ────────────────────────────────────────────────
client.lavalink.on('playerQueueEmptyStart', (player) => {
  if (getStay247(player.guildId)) {
    const timer = player.getData('internal_queueempty');
    if (timer) {
      clearTimeout(timer);
      player.setData('internal_queueempty', void 0);
    }
  }
});


// ── Load handlers ──────────────────────────────────────────────────────────
await loadCommands(client);
await loadEvents(client);

// ── Login ──────────────────────────────────────────────────────────────────
await client.login(process.env.BOT_TOKEN);

// ── Dashboard ──────────────────────────────────────────────────────────────
startWebServer(client);

export { client };
