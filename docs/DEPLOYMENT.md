# Deploying Rae to production

This guide takes the bot and its web dashboard from a fresh Linux server to a public HTTPS address. It covers two ways to expose the dashboard:

- **nginx** on the same server, with a Let's Encrypt certificate (most control).
- **Cloudflare Tunnel** (no open ports and no certificates to manage).

> The proxy and tunnel configs below are templates written against how the bot behaves. Adjust names and paths to your setup, and check each step (`nginx -t`, the logs, a browser login) before relying on it.

## Contents

1. [How the pieces fit](#1-how-the-pieces-fit)
2. [What you need](#2-what-you-need)
3. [Discord setup](#3-discord-setup)
4. [Get the code and create the data folder](#4-get-the-code-and-create-the-data-folder)
5. [Configure `.env`](#5-configure-env)
6. [Lavalink](#6-lavalink)
7. [First start](#7-first-start)
8. [Option A: nginx and Let's Encrypt](#8-option-a-nginx-and-lets-encrypt)
9. [Option B: Cloudflare Tunnel](#9-option-b-cloudflare-tunnel)
10. [Security checklist](#10-security-checklist)
11. [Running day to day: updates, logs, backups](#11-running-day-to-day-updates-logs-backups)
12. [Without Docker](#12-without-docker)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. How the pieces fit

```
Browser ──HTTPS──> nginx or Cloudflare ──HTTP──> bot container :3000
                                                   │  dashboard pages, /api, /auth, /ws (WebSocket)
                                                   │
                  Discord (gateway + OAuth) <──────┤
                                                   │
                                                   └──> Lavalink :2333 (private network only)
```

- The dashboard is served by the bot itself on port 3000. There is no separate web server to run.
- Lavalink is only reachable from the bot's Docker network. Never publish port 2333 to the internet.
- The only thing that should face the internet is HTTPS on your domain.

## 2. What you need

- A Linux server with **Docker** and **Docker Compose** (Docker 24+ is fine).
- A **domain name** you control, for example `music.example.com`, pointing at the server (nginx option) or managed in Cloudflare (tunnel option).
- A Discord application with a bot (next section).
- Optional: a free [Last.fm API key](https://www.last.fm/api/account/create) for better autoplay recommendations.

## 3. Discord setup

In the [Developer Portal](https://discord.com/developers/applications), create (or open) your application.

1. **Bot tab:** create the bot and copy the **token** (`BOT_TOKEN`). No privileged intents are needed; the bot only uses the Guilds and Voice States intents.
2. **General Information:** copy the **Application ID** (`CLIENT_ID`).
3. **OAuth2 tab:** copy the **Client Secret** (`CLIENT_SECRET`) and add this under **Redirects**:

   ```
   https://music.example.com/auth/callback
   ```

   Use your real public address. It must match `DASHBOARD_URL` + `/auth/callback` exactly: same scheme, same host, no trailing slash. Save the change.
4. **Invite the bot** to your servers with this link (it asks for Connect, Speak, View Channel, Send Messages, Embed Links and the slash-command scope):

   ```
   https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=277293925376&scope=bot%20applications.commands
   ```

## 4. Get the code and create the data folder

```bash
git clone https://github.com/urfavteddybear/rae-bot.git
cd rae-bot
cp .env.example .env

# Profile history (data/rae.db) is stored here. The container runs as uid 1000,
# so the folder must be writable by that user, or profiles will be unavailable.
mkdir -p data
sudo chown 1000:1000 data
```

## 5. Configure `.env`

Edit `.env`. Everything below goes in that one file.

### Required

| Variable | Value |
|---|---|
| `BOT_TOKEN` | Bot token from the Developer Portal. Keep it secret. |
| `CLIENT_ID` | Application ID. |
| `CLIENT_SECRET` | OAuth2 client secret. **Setting it turns the dashboard on.** |
| `DASHBOARD_URL` | The public address, e.g. `https://music.example.com`. No trailing slash. |

`DASHBOARD_URL` matters more than it looks: the Discord login returns to this address, and every action (play, skip, queue) and the live WebSocket are only accepted when the browser's `Origin` is exactly this value. People must open the dashboard at this address; `www.` or another hostname will fail to log in or connect.

### Recommended for production

| Variable | Value |
|---|---|
| `TRUST_PROXY` | `1` when exactly one proxy sits in front (nginx **or** the tunnel). Use `2` if two do (for example Cloudflare's proxy in front of nginx). Without it, rate limits see every visitor as the proxy's address and everyone shares one limit. |
| `SESSION_SECRET` | A random string of **at least 32 characters** that signs login cookies. Generate one with `openssl rand -hex 32`. If you set a shorter value the dashboard refuses to start. If you leave it empty it is derived from `BOT_TOKEN`, so rotating the token logs everyone out. |
| `LASTFM_API_KEY` | Your Last.fm API key (the key only, not the shared secret). Autoplay uses Last.fm when it's set and Deezer otherwise. |

### Optional

| Variable | Default | What it does |
|---|---|---|
| `WEB_PORT` | `3000` | The port published on the **host**. Inside the container the dashboard is always on 3000. |
| `DB_PATH` | `data/rae.db` | Where profile history is stored (inside the container). Leave it as is with the compose file. |
| `DEFAULT_SEARCH_ENGINE` | `dzsearch` | Search source for `/play` (`dzsearch`, `ytsearch`, `scsearch`, `amsearch`, `spsearch`). |
| `QUEUE_LIMIT` | unlimited | Maximum tracks per queue. |
| `ALLOWED_URL_HOSTS` | built-in list | Extra hosts `/play` may load links from, comma separated. |
| `OWNER_IDS` | none | Discord user IDs allowed to see Lavalink addresses in `/nodes`. |
| `INVITE_URL`, `SUPPORT_SERVER`, `ACCENT_COLOR` | | Cosmetic settings for `/invite`, `/help` and embeds. |
| `GUILD_ID` | none | Used only by `npm run deploy`: register slash commands in this one server (instant) instead of globally (up to an hour). |

A production `.env` looks like this:

```env
BOT_TOKEN=...
CLIENT_ID=...
CLIENT_SECRET=...
DASHBOARD_URL=https://music.example.com
SESSION_SECRET=6f1c...64 hex characters...
TRUST_PROXY=1
LASTFM_API_KEY=...
```

Note: `LAVALINK_NODES` in `.env` is overridden by the value in `docker-compose.yml` when you use the bundled Lavalink (see the next section).

## 6. Lavalink

The compose file starts a Lavalink container for you and connects the bot to it over the private Docker network. Its port is not published to the host.

**Change the default password** if anything beyond the bot could ever reach Lavalink. It is set in four places that must agree:

1. `docker-compose.yml`: `LAVALINK_SERVER_PASSWORD` (Lavalink service).
2. `docker-compose.yml`: the `Authorization` header in the Lavalink healthcheck.
3. `docker-compose.yml`: `authorization` inside `LAVALINK_NODES` (bot service).
4. `lavalink/application.yml`: `lavalink.server.password`.

**Using a Lavalink on another machine** (for example over Tailscale): remove the `lavalink` service and the bot's `depends_on`, then set `LAVALINK_NODES` in the bot service to your node, for example:

```yaml
- LAVALINK_NODES=[{"host":"100.64.0.5","port":2333,"authorization":"a-strong-password","secure":false,"id":"main"}]
```

Keep that Lavalink off the public internet and use a strong password.

## 7. First start

```bash
docker compose up -d --build
docker compose logs -f bot
```

In the logs, look for:

- `Loaded N commands`
- `Profile stats enabled (/app/data/rae.db)` (if you see "unavailable", re-check the data folder permissions from step 4)
- `Dashboard listening on https://music.example.com (port 3000)`
- the Lavalink node connecting

Register the slash commands once (and again whenever a command changes):

```bash
docker exec rae-bot node src/deploy-commands.js
```

Then put a proxy or tunnel in front (next two sections) before opening the dashboard to people.

---

## 8. Option A: nginx and Let's Encrypt

### 8.1 Publish the dashboard to the proxy only

In `docker-compose.yml`, change the bot's port line so only the server itself (nginx) can reach it:

```yaml
    ports:
      - "127.0.0.1:3000:3000"
```

Then `docker compose up -d`.

### 8.2 Install nginx and certbot

```bash
sudo apt install nginx certbot   # Debian/Ubuntu
```

Open ports 80 and 443 in your firewall, and make sure your domain's DNS A/AAAA record points at the server.

### 8.3 Site configuration

Create `/etc/nginx/sites-available/rae` (replace `music.example.com`), then link it into `sites-enabled`:

```nginx
# Lets WebSocket upgrades through, and closes normal connections cleanly.
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80;
    server_name music.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name music.example.com;

    # created in step 8.4
    ssl_certificate     /etc/letsencrypt/live/music.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/music.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        proxy_set_header Host              $host;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket (/ws): live playback state
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_read_timeout  3600s;
        proxy_send_timeout  3600s;
    }
}
```

Things to leave alone:

- Don't rewrite or remove the `Origin` header. The dashboard rejects requests (and WebSocket connections) whose origin doesn't match `DASHBOARD_URL`.
- Don't add your own HSTS or security headers. The dashboard already sends a strict Content-Security-Policy, HSTS (when `DASHBOARD_URL` is `https://`), and the other headers.
- Keep `TRUST_PROXY=1` in `.env`. The `X-Forwarded-For` line above is what lets the dashboard see each visitor's real address.

### 8.4 Certificate and reload

nginx can't start with a certificate that doesn't exist yet, so get the certificate first (this briefly needs port 80 free, so nginx is stopped). The hooks are remembered for automatic renewal:

```bash
sudo systemctl stop nginx
sudo certbot certonly --standalone -d music.example.com \
  --pre-hook "systemctl stop nginx" --post-hook "systemctl start nginx"
sudo systemctl start nginx

sudo ln -s /etc/nginx/sites-available/rae /etc/nginx/sites-enabled/rae
sudo nginx -t && sudo systemctl reload nginx
```

`sudo certbot renew --dry-run` checks that renewal works.

### 8.5 Check it

- `curl -I https://music.example.com/` returns `200` with a `strict-transport-security` header.
- Open the address, click **Continue with Discord**, and log in.
- Join a voice channel with the bot. The page should update live (that's the WebSocket working).

---

## 9. Option B: Cloudflare Tunnel

A tunnel makes an outbound connection from your server to Cloudflare, so you open **no inbound ports** and manage **no certificates**. Your domain's DNS must be on Cloudflare.

### 9.1 Create the tunnel

1. In the Cloudflare dashboard, open **Zero Trust → Networks → Tunnels** and create a tunnel (type: Cloudflared). Copy its **token**.
2. Under the tunnel's **Public Hostname** tab, add:
   - **Hostname:** `music.example.com`
   - **Service:** `HTTP`, `rae-bot:3000`

   (`rae-bot` is the bot container's name on the compose network.)

### 9.2 Add the tunnel to compose

Add this service to `docker-compose.yml`:

```yaml
  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: rae-tunnel
    restart: unless-stopped
    command: tunnel --no-autoupdate run
    environment:
      - TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
    networks:
      - bot-network
```

Then:

1. **Remove the `ports:` section** from the bot service. The dashboard no longer needs to be reachable from the host.
2. Add to `.env`:

   ```env
   CLOUDFLARE_TUNNEL_TOKEN=...
   DASHBOARD_URL=https://music.example.com
   TRUST_PROXY=1
   ```

3. `docker compose up -d`.

WebSockets work through tunnels without extra settings. If you also keep nginx in front of the tunnel, or turn on Cloudflare's proxy in front of an nginx origin, there are two hops: set `TRUST_PROXY=2`.

### 9.3 Check it

Open `https://music.example.com`, log in with Discord, and confirm the page updates live when you join a voice channel.

---

## 10. Security checklist

- [ ] The dashboard is reachable only over HTTPS at `DASHBOARD_URL`. Login cookies are marked `Secure` only when that URL is `https://`.
- [ ] The Discord OAuth redirect and `DASHBOARD_URL` match exactly.
- [ ] `TRUST_PROXY` matches the number of proxies in front of the bot.
- [ ] `SESSION_SECRET` is set to a random value of 32+ characters (`openssl rand -hex 32`).
- [ ] Lavalink's port is not published, and its default password is changed if anything else can reach it.
- [ ] With nginx: the bot's port is bound to `127.0.0.1`. With a tunnel: no `ports:` on the bot.
- [ ] `.env` is not committed (it's in `.gitignore`) and only you can read it: `chmod 600 .env`.
- [ ] The server's firewall allows only SSH, 80 and 443 (nginx) or only SSH (tunnel).
- [ ] You rotate `BOT_TOKEN` and `CLIENT_SECRET` in the Developer Portal if they ever leak.

Built-in protections you don't need to configure: per-IP and per-user rate limits, origin checks on every state-changing request and WebSocket, a strict content security policy, signed session cookies that are revoked on log out, and a link allow-list for `/play`.

## 11. Running day to day: updates, logs, backups

**Logs**

```bash
docker compose logs -f bot
docker compose logs --tail 100 lavalink
```

**Update**

```bash
git pull
docker compose up -d --build
docker exec rae-bot node src/deploy-commands.js   # only if commands were added or changed
```

Your `.env` and the `data/` folder are not touched by an update.

**Back up profile history** (`data/rae.db`). The safest way while the bot runs is SQLite's own backup:

```bash
sqlite3 data/rae.db ".backup 'rae-backup.db'"
```

Without the `sqlite3` tool, stop the bot (`docker compose stop bot`), copy `data/rae.db` (and the `rae.db-wal` and `rae.db-shm` files if present), then start it again. To restore, stop the bot, put the file back in `data/`, make sure uid 1000 owns it, and start the bot.

**Restarts:** containers use `restart: unless-stopped`, so they come back after a reboot as long as Docker starts on boot (`sudo systemctl enable docker`).

## 12. Without Docker

You can run the bot directly if you provide Lavalink yourself.

- **Node.js 22.13 or newer** (profile history uses Node's built-in SQLite).
- Install and build: `npm install --omit=dev && npm run build:web`.
- Set `LAVALINK_NODES` in `.env` to your Lavalink, for example `[{"host":"localhost","port":2333,"authorization":"...","secure":false,"id":"main"}]`.
- Run with `npm start`, ideally under a process manager (systemd or pm2) so it restarts on failure.
- The nginx configuration is the same; point `proxy_pass` at `http://127.0.0.1:3000`. The bot listens on `WEB_PORT` (default 3000).

## 13. Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| Discord says **invalid redirect_uri** | The redirect in the Developer Portal doesn't exactly match `DASHBOARD_URL` + `/auth/callback` (scheme, host, trailing slash). |
| Log in works, then you're sent back to the login page | Cookies aren't sticking. `DASHBOARD_URL` must be the `https://` address you actually browse, and you must visit it at exactly that hostname. |
| "Bad origin" or the page loads but never goes live | The browser's origin doesn't match `DASHBOARD_URL`, or the proxy isn't forwarding WebSocket upgrades. Check the `Upgrade`/`Connection` headers in the nginx config, and that nothing rewrites `Origin`. |
| The log says `Dashboard disabled` | `CLIENT_SECRET` isn't set. |
| The log says `SESSION_SECRET must be at least 32 characters` | Make it longer (`openssl rand -hex 32`) or remove it. |
| The log warns about `X-Forwarded-For` without `TRUST_PROXY` | You're behind a proxy but `TRUST_PROXY` isn't set. Set it to the number of proxies. |
| People hit "Too many requests" quickly | Same cause: every visitor looks like one address. Set `TRUST_PROXY` correctly. |
| Profile page says profiles are unavailable | The Node version is below 22.13, or the `data/` folder isn't writable by uid 1000 (`sudo chown 1000:1000 data`). |
| Slash commands don't show up | Run `docker exec rae-bot node src/deploy-commands.js`. Global commands can take up to an hour; set `GUILD_ID` for instant registration in one server. |
| The bot can't play anything | Check the Lavalink container is healthy (`docker compose ps`) and the log shows the node connecting. The password must match in all four places. |
| Autoplay isn't using Last.fm | `LASTFM_API_KEY` is empty, or the container wasn't recreated after you added it. Use `docker compose up -d --force-recreate bot`; a plain restart doesn't re-read `.env`. |
