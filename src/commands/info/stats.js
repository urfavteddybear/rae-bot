import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import os from 'node:os';

function formatUptime(ms) {
  const totalSec = Math.floor((ms || 0) / 1000);
  const days = Math.floor(totalSec / 86400);
  const hrs = Math.floor((totalSec % 86400) / 3600);
  const min = Math.floor((totalSec % 3600) / 60);
  const sec = totalSec % 60;

  const parts = [];
  if (days > 0) parts.push(`${days} day${days === 1 ? '' : 's'}`);
  if (hrs > 0 || days > 0) parts.push(`${hrs} hr${hrs === 1 ? '' : 's'}`);
  if (min > 0 || hrs > 0 || days > 0) parts.push(`${min} min`);
  parts.push(`${sec} sec`);
  return parts.join(', ');
}

function cpuAverage() {
  const cpus = os.cpus() || [];
  if (cpus.length === 0) return { idle: 0, total: 0 };
  let idleMs = 0;
  let totalMs = 0;
  for (const cpu of cpus) {
    for (const type in cpu.times) {
      totalMs += cpu.times[type];
    }
    idleMs += cpu.times.idle;
  }
  return { idle: idleMs / cpus.length, total: totalMs / cpus.length };
}

async function getCpuUsage() {
  const start = cpuAverage();
  await new Promise(resolve => setTimeout(resolve, 100));
  const end = cpuAverage();
  const idleDiff = end.idle - start.idle;
  const totalDiff = end.total - start.total;
  if (totalDiff <= 0) return '0.0%';
  const usage = (1 - idleDiff / totalDiff) * 100;
  return `${Math.min(100, Math.max(0, usage)).toFixed(1)}%`;
}

export default {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Show bot statistics'),

  async execute(interaction, client) {
    const users = client.guilds.cache.reduce((acc, g) => acc + (g.memberCount || 0), 0);
    const ping = client.ws.ping >= 0 ? `${Math.round(client.ws.ping)}ms` : '0ms';
    const loadAvg = os.loadavg().map(n => n.toFixed(3)).join(', ');
    const freeMemGB = (os.freemem() / (1024 ** 3)).toFixed(3);
    const totalMemGB = (os.totalmem() / (1024 ** 3)).toFixed(3);
    const freeMem = `${freeMemGB} GB / ${totalMemGB} GB`;
    const uptime = formatUptime(client.uptime);
    const cpuUsage = await getCpuUsage();

    const embed = new EmbedBuilder()
      .setColor(parseInt(process.env.ACCENT_COLOR ?? '5865F2', 16))
      .setTitle(`${client.user.username} Statistics`)
      .addFields(
        { name: 'Users',     value: `${users}`,  inline: true },
        { name: 'Ping',      value: ping,        inline: true },
        { name: 'Load Avg',  value: loadAvg,     inline: true },
        { name: 'Free Mem',  value: freeMem,     inline: true },
        { name: 'Uptime',    value: uptime,      inline: true },
        { name: 'CPU Usage', value: cpuUsage,    inline: true },
      )
      .setFooter({ text: `PID ${process.pid}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
