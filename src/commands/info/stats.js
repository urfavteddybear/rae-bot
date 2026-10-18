import { SlashCommandBuilder } from 'discord.js';
import fs from 'node:fs';
import os from 'node:os';
import { OWNER_IDS } from '../../utils/limits.js';
import { dashboardUrl } from '../../utils/nowPlayingControls.js';
import { box, divider, message, small } from '../../utils/ui.js';

const pkg = JSON.parse(fs.readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'));

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 2 });
const num = (n) => compact.format(n ?? 0).toLowerCase();

function bytes(n) {
  if (n == null) return 'N/A';
  const mib = n / 1024 ** 2;
  return mib >= 1024 ? `${(mib / 1024).toFixed(1)} GiB` : `${mib.toFixed(1)} MiB`;
}

/** 3d 2h / 18h 24m / 5m 3s */
function duration(ms) {
  const s = Math.floor((ms || 0) / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}

/** CPU used by this process over a short sample, as a percentage of one core. */
async function processCpu() {
  const start = process.cpuUsage();
  const t0 = process.hrtime.bigint();
  await new Promise((resolve) => setTimeout(resolve, 100));
  const used = process.cpuUsage(start);
  const elapsedUs = Number(process.hrtime.bigint() - t0) / 1000;
  return ((used.user + used.system) / elapsedUs) * 100;
}

/** Number of people (not bots) in the voice channel the player is connected to. */
function listeners(client, player) {
  const channel = client.guilds.cache.get(player.guildId)?.channels.cache.get(player.voiceChannelId);
  return channel?.members?.filter((m) => !m.user.bot).size ?? 0;
}

/** Round trip to the web player, or null when it can't be reached. Any HTTP answer counts, even a 401. */
async function webPlayerPing(url) {
  const start = process.hrtime.bigint();
  try {
    await fetch(`${url.replace(/\/+$/, '')}/api/me`, { redirect: 'manual', signal: AbortSignal.timeout(3000) });
    return Math.round(Number(process.hrtime.bigint() - start) / 1e6);
  } catch {
    return null;
  }
}

function nodeBlock(node, { showName, showAddress }) {
  const s = node.stats;
  const details = [
    showAddress ? `**Address:** ${node.options.host}:${node.options.port}` : null,
    `**Status:** ${node.connected ? 'Connected' : 'Disconnected'}`,
    `**Players:** ${s?.players ?? 0} total · ${s?.playingPlayers ?? 0} playing`,
    s?.cpu
      ? `**CPU:** ${(s.cpu.lavalinkLoad * 100).toFixed(1)}% · ${(s.cpu.systemLoad * 100).toFixed(1)}% system · ${s.cpu.cores} cores`
      : '**CPU:** N/A',
    s?.memory
      ? `**Memory:** ${bytes(s.memory.used)} used · ${bytes(s.memory.allocated)} allocated · ${bytes(s.memory.reservable)} reservable`
      : '**Memory:** N/A',
    `**Uptime:** ${s?.uptime ? duration(s.uptime) : 'N/A'}`,
    s?.frameStats
      ? `**Frames:** ${num(s.frameStats.sent)} sent · ${num(s.frameStats.nulled)} nulled · ${num(s.frameStats.deficit)} deficit (last minute)`
      : null,
  ].filter(Boolean).join('\n');
  return [showName ? `**${node.id}**` : null, small(details)].filter(Boolean).join('\n');
}

export default {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Show bot and backend statistics'),

  async execute(interaction, client) {
    await interaction.deferReply();

    const url = dashboardUrl();
    const [cpu, webPing] = await Promise.all([processCpu(), url ? webPlayerPing(url) : null]);
    const mem = process.memoryUsage();
    const users = client.guilds.cache.reduce((sum, g) => sum + (g.memberCount || 0), 0);
    const inVoice = [...client.lavalink.players.values()].reduce((sum, p) => sum + listeners(client, p), 0);
    const showAddress = OWNER_IDS.has(interaction.user.id);
    const nodes = [...client.lavalink.nodeManager.nodes.values()];

    const services = [
      `**${client.user.username}:** up ${duration(client.uptime)} · ${cpu.toFixed(2)}% cpu · ${bytes(mem.rss)} rss · ${bytes(mem.heapUsed)} heap`,
      `**Host:** load ${os.loadavg().map((n) => n.toFixed(2)).join(', ')} · ${bytes(os.freemem())} free of ${bytes(os.totalmem())}`,
    ];
    // The gateway ping is -1 until Discord answers the first heartbeat.
    services.push(`**Bot ping:** ${client.ws.ping >= 0 ? `${Math.round(client.ws.ping)}ms` : 'N/A'}`);
    if (url) services.push(`**Web player ping:** ${webPing == null ? 'unreachable' : `${webPing}ms`}`);

    const backend = nodes.length
      ? nodes.map((node) => nodeBlock(node, { showName: nodes.length > 1, showAddress })).join('\n\n')
      : small('No Lavalink nodes configured.');

    await interaction.editReply(message(box(
      small(`v${pkg.version}`),
      divider(),
      '**Discord**',
      small([
        `**Servers:** ${num(client.guilds.cache.size)}`,
        `**Users:** ${num(users)}`,
        `**In voice:** ${num(inVoice)}`,
      ].join('\n')),
      divider(),
      '**Services**',
      small(services.join('\n')),
      divider(),
      '**Backend stats**',
      backend,
    )));
  },
};
