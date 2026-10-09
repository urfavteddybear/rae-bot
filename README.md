# 🎵 Rae — Discord Music Bot

A fast, lightweight, self-hostable Discord music bot built with **Discord.js v14** and **lavalink-client**.

> **Default source: Deezer** — Spotify, Apple Music, SoundCloud, and YouTube supported via [LavaSrc](https://github.com/topi314/LavaSrc).

---

## ✨ Features

- **28 slash commands** across music, queue, and info categories
- Spotify / Apple Music / SoundCloud / YouTube support
- **24/7 mode** — persisted per guild in SQLite, auto-rejoin on disconnect
- **Autoplay** — continues playing related tracks when queue ends
- **Lyrics** — powered by LavaSrc's built-in lyrics endpoint
- **Docker-first** setup — one `docker compose up -d` and you're live
- **Zero-config Lavalink** included via Docker Compose
- **Minimal footprint** — only 5 npm dependencies, ~4MB installed (excl. Discord.js)

---

## 🚀 Quick Start (Docker — Recommended)

### 1. Clone and configure

```bash
git clone https://github.com/urfavteddybear/rae
cd rae
cp .env.example .env
```

Edit `.env`:
```env
BOT_TOKEN=your_discord_bot_token
CLIENT_ID=your_application_id
```

### 2. Start everything

```bash
docker compose up -d
```

That's it. Lavalink starts first (health-checked), then the bot connects.

### 3. Deploy commands

```bash
docker exec rae-bot node src/deploy-commands.js
```

Or locally (if Node.js ≥ 18 is installed):
```bash
npm install
cp .env.example .env   # fill in BOT_TOKEN and CLIENT_ID
node src/deploy-commands.js
```

---

## 🛠️ Manual / No-Docker Setup

### Requirements
- Node.js ≥ 18
- A running Lavalink v4 instance (local or remote)

### Install

```bash
npm install
cp .env.example .env
```

### Configure `.env`

```env
BOT_TOKEN=...
CLIENT_ID=...
# Point to your Lavalink node
LAVALINK_NODES=[{"host":"localhost","port":2333,"authorization":"youshallnotpass","secure":false,"id":"main"}]
```

### Run

```bash
node src/deploy-commands.js   # first time only
npm start
```

---

## 🎵 Supported Sources

| Source      | Search prefix | Requires                    |
|-------------|---------------|-----------------------------|
| Deezer      | `dzsearch`    | LavaSrc plugin (no API key) |
| Spotify     | `spsearch`    | LavaSrc + Spotify app creds |
| Apple Music | `amsearch`    | LavaSrc + Apple Media token |
| SoundCloud  | `scsearch`    | LavaSrc (no API key)        |
| YouTube     | `ytsearch`    | LavaSrc (no API key needed) |

### Setting up LavaSrc (for Spotify / Apple Music)

1. Download the latest `lavasrc-plugin-x.x.x.jar` from [LavaSrc releases](https://github.com/topi314/LavaSrc/releases)
2. Place it in `lavalink/plugins/`
3. Fill in credentials in `lavalink/application.yml` (optional — Deezer and SoundCloud work without any keys)

---

## 📋 Commands

### 🎵 Music

| Command | Description |
|---------|-------------|
| `/play [query] [source]` | Play a song or playlist by name or URL |
| `/search [query] [source]` | Search and pick from 5 results |
| `/nowplaying` | Show current track with progress bar |
| `/queue [page]` | View the queue |
| `/skip` | Skip the current track |
| `/pause` | Pause playback |
| `/resume` | Resume playback |
| `/volume [1-150]` | Set volume |
| `/loop [off\|track\|queue]` | Set loop mode |
| `/shuffle` | Shuffle the queue |

### ⏭️ Queue

| Command | Description |
|---------|-------------|
| `/clear` | Clear upcoming tracks |
| `/remove [position]` | Remove a track by position |
| `/jump [position]` | Skip to a queue position |
| `/move [from] [to]` | Move a track to a new position |
| `/previous` | Play the previous track |
| `/replay` | Restart the current track |
| `/seek [time]` | Seek to a timestamp (e.g. `1:30` or `90`) |
| `/autoplay` | Toggle autoplay |

### 🔧 Player

| Command | Description |
|---------|-------------|
| `/join` | Join your voice channel |
| `/disconnect` | Disconnect and clear queue |
| `/247` | Toggle 24/7 mode (persisted) |
| `/save` | Send current track to your DMs |
| `/lyrics [query]` | Fetch song lyrics |

### 📊 Info

| Command | Description |
|---------|-------------|
| `/help` | Show all commands |
| `/invite` | Get the bot invite link |
| `/nodes` | Show Lavalink node status |
| `/ping` | Show bot and API latency |
| `/stats` | Show bot statistics |

---

## 🐳 Docker Compose Reference

```yaml
# docker-compose.yml is included — just add your .env and run:
docker compose up -d

# View logs
docker compose logs -f

# Restart bot only
docker compose restart bot

# Stop everything
docker compose down
```

The `bot` service depends on `lavalink` with a health check — it will wait up to 60 s for Lavalink to be ready before starting.

---

## 🔧 Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BOT_TOKEN` | ✅ | — | Discord bot token |
| `CLIENT_ID` | ✅ | — | Discord application ID |
| `LAVALINK_NODES` | ✅ | — | JSON array of Lavalink node configs |
| `DEFAULT_SEARCH_ENGINE` | ❌ | `dzsearch` | Default search prefix |
| `INVITE_URL` | ❌ | auto-generated | Bot invite URL |
| `SUPPORT_SERVER` | ❌ | — | Support server invite |
| `ACCENT_COLOR` | ❌ | `5865F2` | Embed accent colour (hex) |
| `GUILD_ID` | ❌ | — | If set, deploy commands to this guild only (faster for testing) |

---

## 📁 Project Structure

```
rae/
├── src/
│   ├── index.js              # Entry point
│   ├── deploy-commands.js    # One-time command deployer
│   ├── commands/
│   │   ├── music/            # play, skip, queue, etc.
│   │   └── info/             # help, ping, stats, etc.
│   ├── events/
│   │   ├── discord/          # ready, interactionCreate, voiceStateUpdate
│   │   └── lavalink/         # trackStart, trackEnd, queueEnd, nodeConnect
│   ├── handlers/             # Command & event auto-loaders
│   └── utils/
│       ├── embeds.js         # Shared embed builders & guards
│       ├── logger.js         # Lightweight colour logger
│       └── stay247.js        # In-memory 24/7 state store
├── lavalink/
│   ├── application.yml       # Lavalink config (LavaSrc pre-configured)
│   └── plugins/              # Drop LavaSrc JAR here
├── docker-compose.yml
├── Dockerfile
└── .env.example
```

---

## 📝 License

MIT
