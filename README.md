# SUB/WAVE Discord Bot

A feature-rich Discord bot for your [SUB/WAVE](https://github.com/perminder-klair/subwave) AI radio station.

## Features

- 🎵 **Stream audio** directly into Discord voice channels
- 🎤 **Per-guild Icecast connections** — each connected server registers as a separate listener (accurate listener count in SUB/WAVE)
- 📝 **Song requests** via Discord Modals (native pop-up form)
- 🔍 **Library search** to find and request exact tracks
- 📊 **Live station stats** — now playing, listener count, DJ persona, queue
- 🔄 **Auto-reconnect** on stream errors or disconnects

## Prerequisites

- Node.js 18+
- `ffmpeg` on your PATH **or** use the bundled `ffmpeg-static` (included automatically)
- A running SUB/WAVE instance

## Setup

### 1. Create a Discord Application

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications).
2. Click **New Application**, give it a name.
3. Go to **Bot** in the left sidebar and click **Add Bot** / reset token.
4. Copy the **Bot Token**.
5. Go to the **Installation** tab under Settings in the sidebar:
   - Under **Installation Contexts**, check **Guild Install**.
   - Under **Default Install Settings**, add scopes `bot` and `applications.commands`.
   - Add permissions `Send Messages`, `Embed Links`, `Connect`, and `Speak`.
   - Copy the generated **Install Link** to invite the bot to your server.
   *(Note: Privileged Gateway Intents like Message Content are NOT required for this bot, as all commands and modal forms use standard Discord interactions).*

### 2. Configure

Copy `.env.example` to `.env` and fill in your variables:
```bash
cp .env.example .env
```

### 3. Deploy Slash Commands (Local Deploy)
If you are running the bot on your local host:
```bash
npm install
npm run deploy-commands
```
*(Tip: Set `GUILD_ID` in your `.env` to make command updates register instantly on your test server rather than waiting for Discord's global propagation delay).*

### 4. Run (Local Deploy)
```bash
npm start
# or for development with auto-reload:
npm run dev
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DISCORD_TOKEN` | ✅ | Bot token from Discord Developer Portal |
| `CLIENT_ID` | ✅ | Application (client) ID |
| `GUILD_ID` | ❌ | Set for guild-scoped command deployment (instant). Omit for global (up to 1h propagation). |
| `SUBWAVE_URL` | ✅ | Base URL of your SUB/WAVE instance (e.g. `https://radio.example.com`) |
| `SUBWAVE_STREAM_URL` | ✅ | Icecast stream URL (e.g. `http://radio.example.com:7702/stream.mp3`) |
| `ADMIN_USER` | ❌ | SUB/WAVE admin username (enables `/search`) |
| `ADMIN_PASS` | ❌ | SUB/WAVE admin password (enables `/search`) |

---

## Slash Commands

| Command | Description |
|---|---|
| `/play` | Join your current voice channel and start streaming the radio |
| `/stop` | Leave the voice channel and stop streaming |
| `/nowplaying` | Show what's currently on air with a sleek auto-updating card |
| `/request` | Open a text form to submit a song request directly to the AI DJ |
| `/search <query>` | Search the station's library and request a specific track |
| `/stats` | View station health, listener count, and current show |
| `/queue` | Display the upcoming track queue |

---

## Docker Deployment

This project includes a **GitHub Actions Workflow** that automatically builds and publishes multi-platform Docker images (`linux/amd64` and `linux/arm64`) to **GitHub Container Registry (GHCR)** on every push to `main` or tag release (`v*`).

### Method A: Deploy pre-built image (Recommended)

1. Create a `docker-compose.yml` on your server:
   ```yaml
   version: '3.8'
   services:
     bot:
       image: ghcr.io/YOUR_GITHUB_USERNAME/YOUR_REPO_NAME:latest
       container_name: subwave-discord-bot
       restart: unless-stopped
       env_file: .env
   ```
2. Place your populated `.env` file in the same directory.
3. Start the container:
   ```bash
   docker compose up -d
   ```

### Method B: Build locally from source

If you have cloned the repository, you can build the image directly on your host:
```bash
docker compose up -d --build
```

---

## How Listener Counts Work

Each Discord guild that has the bot active in a voice channel opens **one independent HTTP connection** to the Icecast stream. This means if the bot is active in 3 guilds simultaneously, SUB/WAVE's admin panel will show 3 listeners — accurately reflecting each connected server.
