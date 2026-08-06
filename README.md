# SUB/WAVE Discord Bot

A single-station Discord radio bot. It plays exactly one thing — your
[SUB/WAVE](https://github.com/perminder-klair/subwave) station — live in a voice
channel, shows the current track as the bot's rich presence
("🎧 Listening to …"), and lets listeners submit requests to the AI DJ, all
through slash commands.

SUB/WAVE is a personal internet radio station: one Icecast broadcast that every
listener hears at the same time. This bot is a thin Discord front-end over its
public HTTP API.

## Features

- **📻 Live playback** — `/play` joins your voice channel and broadcasts the
  station's Icecast stream. It stays connected 24/7 and auto-reconnects through
  network hiccups.
- **🎧 Now-playing everywhere** — the bot's profile shows *Listening to `Artist
  — Title`* (refreshed automatically), and while it's broadcasting it also posts
  a now-playing card in the channel `/play` was run from on every song change,
  and sets the voice channel's status line to *🎵 Artist — Title*.
- **🙋 Requests** — `/request` opens a form; the request goes to the booth, the
  DJ picks a track, and the bot reports back with the match and its queue
  position.
- **🔗 Tune-in links** — `/tunein` hands out direct stream / `.pls` / `.m3u`
  links for VLC, Sonos, browsers, and hardware radios.
- **👋 Leaves empty channels** — the bot disconnects automatically ~30s after
  the last person leaves the voice channel.
- **Slash commands, user- *and* guild-installable** — the informational
  commands work as a user-install (in DMs and any server) as well as a classic
  guild install; voice playback is guild-only (a bot must be a server member to
  join voice). Every reply uses a consistent embed style.

## Commands

| Command    | Where it works                     | What it does |
| ---------- | ---------------------------------- | ------------ |
| `/request` | anywhere (user + guild install)    | Open a form to ask the DJ to play something |
| `/tunein`  | anywhere (user + guild install)    | Direct listen links (ephemeral) |
| `/play`    | in a server                        | Broadcast the station in your voice channel; posts now-playing cards there on each song change |
| `/stop`    | in a server                        | Leave the voice channel |

The current track is shown by the bot's **rich presence** and the **voice
channel status**, so there's no `/nowplaying` command.

## Prerequisites

- **Node.js ≥ 20**
- **ffmpeg** on your `PATH` (`ffmpeg -version` should work) — used to transcode
  the Icecast stream for Discord voice.
- A **Discord application + bot** — create one at the
  [Developer Portal](https://discord.com/developers/applications).
- A running **SUB/WAVE** station with a reachable public origin.

## Configure the Discord application

In the [Developer Portal](https://discord.com/developers/applications) for your
app — needed for both deployment methods below:

- **Installation** → under *Installation Contexts*, enable both **Guild
  Install** and **User Install**. This is what makes the bot usable by
  individual users (in DMs / any server) as well as installed to servers.
- **Bot** → no privileged intents are required. The bot uses only the default
  **Guilds** and **Guild Voice States** gateway intents.
- Grant the bot the **Connect** and **Speak** permissions in any server where it
  should play audio.

## Deploy with Docker (recommended for SUB/WAVE operators)

If you already run SUB/WAVE with Docker Compose, this is the easy path: a
prebuilt image is published to GHCR, and a small compose overlay slots the bot
into your existing stack.

1. **Create the Discord app** and note its token + application ID (see
   [Configure the Discord application](#configure-the-discord-application)
   below). Under **Installation**, enable both **Guild Install** and **User
   Install**.

2. **Add your Discord credentials** to your existing SUB/WAVE `.env` (the same
   file with `SITE_URL`, `NAVIDROME_URL`, …):

   ```dotenv
   DISCORD_TOKEN=your-bot-token
   DISCORD_CLIENT_ID=your-application-id
   # STATION_NAME=My Station          # optional
   ```

   The bot reuses your `SITE_URL` automatically as the station origin — no other
   config needed.

3. **Drop [`docker-compose.discord.yml`](docker-compose.discord.yml)** into your
   SUB/WAVE directory (next to `docker-compose.yml`) and add it to your usual up
   command with a second `-f`:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.discord.yml up -d
   ```

That's it. The container registers its slash commands on first boot
(`AUTO_DEPLOY_COMMANDS=true`), starts tracking now-playing, and is ready for
`/play` in a voice channel. To update later, `docker compose ... pull` then `up
-d` again.

> **Image:** `ghcr.io/foggymtndrifter/subwave-discord-bot:latest`. The overlay
> reads `DISCORD_BOT_IMAGE` if you'd rather pin a version (e.g.
> `:1.0.0`). The image is built and published automatically by
> [`.github/workflows/docker-publish.yml`](.github/workflows/docker-publish.yml)
> on every push to `main` and every `v*` tag.
>
> **Reaching the station:** the bot talks to your station over its public
> `SITE_URL`, so that origin must be reachable from inside the container. If your
> host can't hairpin its own public domain, set `SUBWAVE_BASE_URL` in `.env` to
> an address the container can reach instead.

## Run locally (Node)

1. **Install dependencies**

   ```bash
   npm install
   ```

   > `@discordjs/opus` builds a small native module; on macOS/Linux this needs
   > standard build tools (Xcode CLT / `build-essential`), which most dev
   > machines already have.

2. **Configure**

   ```bash
   cp .env.example .env
   ```

   Fill in `.env`:

   - `DISCORD_TOKEN` — Bot → *Reset Token*.
   - `DISCORD_CLIENT_ID` — General Information → *Application ID*.
   - `SUBWAVE_BASE_URL` — your station origin, e.g. `https://radio.example.com`.
   - *(optional)* `DISCORD_DEV_GUILD_ID` — a test server ID for instant command
     registration while developing.

   Make sure your app is configured per
   [Configure the Discord application](#configure-the-discord-application) above.

3. **Register the slash commands**

   ```bash
   npm run deploy
   ```

   With `DISCORD_DEV_GUILD_ID` set, commands appear instantly in that server.
   Without it they register globally (can take up to ~1 hour the first time).
   (Alternatively set `AUTO_DEPLOY_COMMANDS=true` to register on startup.)

4. **Run the bot**

   ```bash
   npm start
   ```

## How it works

- **Station API** (`src/subwave.js`) wraps the SUB/WAVE HTTP API under
  `SUBWAVE_BASE_URL/api`: `GET /now-playing`, `POST /request` + `GET /request/:id`,
  and the `/cover/:id` art proxy. Everything is unauthenticated.
- **Station watcher** (`src/station.js`) is the single poller of `/now-playing`.
  It emits `update` every poll (drives presence) and `trackChange` only when the
  track actually changes (drives the channel announcements and voice-channel
  status). One broadcast, one source of truth.
- **Voice** (`src/voice.js`) discovers the Icecast mount from `/now-playing`
  (or `SUBWAVE_STREAM_URL`), then runs `ffmpeg` to pull the stream and emit raw
  48 kHz stereo PCM into a per-guild `AudioPlayer`. If ffmpeg or the player
  drops, it respawns automatically — right for a never-ending radio feed. Each
  session remembers the channel `/play` was run in (for song-change cards), sets
  the voice channel's status, and leaves when the channel empties.
- **Presence** (`src/presence.js`) subscribes to the watcher and sets the bot's
  global activity to *Listening to `Artist — Title`*.
- **Embeds** (`src/embeds.js`) is the one place embed styling lives, so every
  command and announcement shares the same look.

## Configuration reference

| Variable                 | Required | Default        | Notes |
| ------------------------ | :------: | -------------- | ----- |
| `DISCORD_TOKEN`          | ✅       | —              | Bot token |
| `DISCORD_CLIENT_ID`      | ✅       | —              | Application ID (for command registration) |
| `SUBWAVE_BASE_URL`       | ✅       | —              | Station origin, no trailing slash |
| `DISCORD_DEV_GUILD_ID`   |          | —              | Register commands to one guild instantly |
| `SUBWAVE_STREAM_URL`     |          | auto-discovered| Override the Icecast mount |
| `STATION_NAME`           |          | `SUB/WAVE`     | Display name in embeds/presence |
| `PRESENCE_INTERVAL_MS`   |          | `15000`        | Now-playing / presence poll interval |
| `REQUEST_POLL_TIMEOUT_MS`|          | `25000`        | How long to poll a request for its outcome |
| `AUTO_DEPLOY_COMMANDS`   |          | `false`        | Register slash commands on startup (the Docker image sets this) |

## Notes & limits

- A Discord bot has a **single global presence**, so the "now playing" status is
  the station's current track — shared by every server, exactly like the
  broadcast itself.
- Voice playback requires the bot to be a **member of the server**; a pure
  user-install (no bot in the server) can still use `/request` and `/tunein`,
  but not `/play`.
- **Requests can be turned off.** At startup the bot checks whether the station
  accepts requests, and if not, `/request` isn't registered at all. (Flip it back
  on and re-run `npm run deploy` / restart to bring the command back.)
- **Request limits are shared.** SUB/WAVE rate-limits requests per listener, and
  the bot is a single listener — so its per-listener cooldown and hourly cap are
  shared across everyone using it. When a limit is hit (or requests are paused
  because nobody's tuned in), the requester gets a friendly "try again in …"
  message rather than a raw error.

## License

MIT
