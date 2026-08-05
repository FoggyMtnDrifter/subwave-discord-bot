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
- **🎧 Now-playing rich presence** — the bot's profile shows
  *Listening to `Artist — Title`*, refreshed automatically from the station.
- **🙋 Requests** — `/request something slower` sends a free-text request to the
  booth; the DJ picks a track, and the bot reports back with the match and its
  queue position.
- **🔗 Tune-in links** — `/tunein` hands out direct stream / `.pls` / `.m3u`
  links for VLC, Sonos, browsers, and hardware radios.
- **Slash commands, user- *and* guild-installable** — the informational
  commands work as a user-install (in DMs and any server) as well as a classic
  guild install; voice playback is guild-only (a bot must be a server member to
  join voice).

## Commands

| Command        | Where it works                     | What it does |
| -------------- | ---------------------------------- | ------------ |
| `/nowplaying`  | anywhere (user + guild install)    | Current track, artist, album art, DJ, listener count |
| `/request <text>` | anywhere (user + guild install) | Ask the DJ to play something |
| `/tunein`      | anywhere (user + guild install)    | Direct listen links (ephemeral) |
| `/play`        | in a server                        | Broadcast the station in your voice channel |
| `/stop`        | in a server                        | Leave the voice channel |

## Prerequisites

- **Node.js ≥ 20**
- **ffmpeg** on your `PATH` (`ffmpeg -version` should work) — used to transcode
  the Icecast stream for Discord voice.
- A **Discord application + bot** — create one at the
  [Developer Portal](https://discord.com/developers/applications).
- A running **SUB/WAVE** station with a reachable public origin.

## Setup

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

3. **Configure the Discord application**

   In the Developer Portal for your app:

   - **Installation** → under *Installation Contexts*, enable both **Guild
     Install** and **User Install**. This is what makes the bot usable by
     individual users (in DMs / any server) as well as installed to servers.
   - **Bot** → enable the **Server Members Intent**? Not required. This bot only
     needs the default **Guilds** and **Guild Voice States** gateway intents,
     both of which are on by default. No privileged intents are used.
   - Grant the bot the **Connect** and **Speak** permissions in any server where
     it should play audio.

4. **Register the slash commands**

   ```bash
   npm run deploy
   ```

   With `DISCORD_DEV_GUILD_ID` set, commands appear instantly in that server.
   Without it they register globally (can take up to ~1 hour the first time).

5. **Run the bot**

   ```bash
   npm start
   ```

## How it works

- **Station API** (`src/subwave.js`) wraps the SUB/WAVE HTTP API under
  `SUBWAVE_BASE_URL/api`: `GET /now-playing`, `POST /request` + `GET /request/:id`,
  and the `/cover/:id` art proxy. Everything is unauthenticated.
- **Voice** (`src/voice.js`) discovers the Icecast mount from `/now-playing`
  (or `SUBWAVE_STREAM_URL`), then runs `ffmpeg` to pull the stream and emit raw
  48 kHz stereo PCM into a per-guild `AudioPlayer`. If ffmpeg or the player
  drops, it respawns automatically — right for a never-ending radio feed.
- **Presence** (`src/presence.js`) polls `/now-playing` on an interval and sets
  the bot's global activity to *Listening to `Artist — Title`*.

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

## Notes & limits

- A Discord bot has a **single global presence**, so the "now playing" status is
  the station's current track — shared by every server, exactly like the
  broadcast itself.
- Voice playback requires the bot to be a **member of the server**; a pure
  user-install (no bot in the server) can still use `/nowplaying`, `/request`,
  and `/tunein`, but not `/play`.
- Requests are **rate-limited per client by the station** and paused when nobody
  is listening; the bot surfaces that back to the requester.

## License

MIT
