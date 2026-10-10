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

### 2. Create the data folder

Profile history is stored in `./data` (mounted into the container at `/app/data`). The bot runs as a non-root user (uid 1000), so create the folder first and make it writable by that user, otherwise Docker creates it owned by root and the database can't be opened (the bot still runs, but the Profile page says it's unavailable):

```bash
mkdir -p data
sudo chown 1000:1000 data
```

Docker Desktop on Windows and macOS doesn't need the `chown`.

### 3. Start everything

```bash
docker compose up -d
```

That's it. Lavalink starts first (health-checked), then the bot connects.

### 4. Deploy commands

```bash
docker exec rae-bot node src/deploy-commands.js
```

Or locally (if Node.js ≥ 22.13 is installed):
```bash
npm install
cp .env.example .env   # fill in BOT_TOKEN and CLIENT_ID
node src/deploy-commands.js
```

---

## 🛠️ Manual / No-Docker Setup

### Requirements
- Node.js ≥ 22.13 (profile stats use Node's built-in SQLite, so there is nothing to compile)
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

## 🖥️ Web Dashboard

An Apple Music-style web player for your servers: now playing with live progress, synced lyrics, queue and history (drag to reorder), and search for songs, albums and artists. Everything is live over WebSocket and works alongside the slash commands.

**Setup**

1. In the [Discord Developer Portal](https://discord.com/developers/applications) > your app > **OAuth2**, copy the **Client Secret** and add the redirect `<DASHBOARD_URL>/auth/callback` (e.g. `http://localhost:3000/auth/callback`).
2. Set `CLIENT_SECRET` and `DASHBOARD_URL` in `.env` (see `.env.example`). Without `CLIENT_SECRET` the dashboard stays off.
3. Docker: `docker compose up -d --build` (the image builds the frontend). Open `http://localhost:3000`.
   Without Docker: `npm run build:web` then `npm start`.

**Profile page:** each person gets a Profile tab with their plays, different songs, first played, most repeated songs and recently played songs. It belongs to the Discord account, so it's the same in every server the bot is in. A play is counted when a song starts, for the person who queued it (autoplay songs count for nobody). History is stored in a SQLite file (`DB_PATH`, default `data/rae.db`). With Docker it's the `./data` folder on the host, so back that folder up if you want to keep the history (see the data folder permissions in Quick Start). People can delete their own history from the Profile page.

**Development:** run the bot, then `npm run dev:web` (Vite on :5173 proxies to the bot on :3000).

**Access rules:** anyone in a server the bot is in can view it. To control playback you must be in the same voice channel as the bot. If the bot isn't connected, adding a song from the dashboard joins your voice channel. Search and album/artist data comes from Deezer's public API, so the Deezer source must be enabled in Lavalink (it is by default). Lyrics come from lrclib.net. For HTTPS, put a reverse proxy in front and set `DASHBOARD_URL` to the public `https://` address. A step-by-step production guide (nginx or Cloudflare Tunnel, environment variables, security checklist, backups, troubleshooting) is in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

---

## 🔒 Security

- **Voice-channel gating:** slash commands that change playback (`/skip`, `/clear`, `/disconnect`, ...) only work for people in the bot's voice channel. The bot won't be pulled out of a channel that still has listeners. `/247` needs **Manage Server**.
- **Link allow-list:** `/play` only accepts links from known music services (extend with `ALLOWED_URL_HOSTS`), so Lavalink can't be pointed at internal addresses.
- **Limits:** queries are capped at 300 characters. Queues are unlimited unless you set `QUEUE_LIMIT`.
- **Dashboard:** per-IP and per-user rate limits, CSRF protection (origin check + JSON-only), strict CSP and security headers, signed `HttpOnly` cookies (`__Host-` prefixed over HTTPS), session revocation on logout, WebSocket origin/connection limits, and a size-capped, raster-only image proxy.
- **Behind a reverse proxy:** set `TRUST_PROXY=1` (number of proxies) so rate limits see real visitor IPs, and serve over HTTPS.
- **Lavalink:** the compose setup doesn't publish Lavalink's port. If you expose it elsewhere, change the default `youshallnotpass` password in both `lavalink/application.yml` and `LAVALINK_NODES`, or keep it on a private network.

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
| `/autoplay` | Toggle autoplay (queues 20 related songs at a time) |

### 🔧 Player

| Command | Description |
|---------|-------------|
| `/join` | Join your voice channel |
| `/disconnect` | Disconnect and clear queue |
| `/247` | Toggle 24/7 mode (in-memory) |
| `/save` | Send current track to your DMs |
| `/lyrics [query]` | Fetch song lyrics |
| `/debug` | Show player & voice connection debug info |

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
| `LASTFM_API_KEY` | ❌ | — | Last.fm key for better autoplay recommendations |
| `CLIENT_SECRET` | ❌ | — | Enables the web dashboard (Discord OAuth2 secret) |
| `DASHBOARD_URL` | ❌ | `http://localhost:3000` | Public dashboard URL (used for the OAuth redirect) |
| `WEB_PORT` | ❌ | `3000` | Dashboard port |
| `SESSION_SECRET` | ❌ | hash of `BOT_TOKEN` | Key for signing login cookies |
| `TRUST_PROXY` | ❌ | `0` | Number of reverse proxies in front of the dashboard |
| `QUEUE_LIMIT` | ❌ | unlimited | Max tracks per queue |
| `ALLOWED_URL_HOSTS` | ❌ | — | Extra hosts `/play` may load links from |
| `OWNER_IDS` | ❌ | — | User IDs that can see Lavalink addresses in `/nodes` |
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
