// Centralised, validated configuration. Reads `.env` once and exposes a frozen
// config object. Fails fast with a clear message when a required var is missing
// so the bot never boots into a half-configured state.
import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    console.error(
      `\n✖ Missing required environment variable: ${name}\n` +
        `  Copy .env.example to .env and fill it in.\n`,
    );
    process.exit(1);
  }
  return value.trim();
}

function optional(name, fallback) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

// Strip a trailing slash so `${baseUrl}/api/...` never doubles up.
const baseUrl = required('SUBWAVE_BASE_URL').replace(/\/+$/, '');

export const config = Object.freeze({
  discord: {
    token: required('DISCORD_TOKEN'),
    clientId: required('DISCORD_CLIENT_ID'),
    devGuildId: optional('DISCORD_DEV_GUILD_ID', null),
  },
  subwave: {
    baseUrl,
    apiUrl: `${baseUrl}/api`,
    // Explicit override wins; otherwise the stream mount is discovered at
    // runtime from /api/now-playing (falls back to /stream.mp3).
    streamUrl: optional('SUBWAVE_STREAM_URL', null),
    stationName: optional('STATION_NAME', 'SUB/WAVE'),
  },
  presenceIntervalMs: Number(optional('PRESENCE_INTERVAL_MS', '15000')),
  requestPollTimeoutMs: Number(optional('REQUEST_POLL_TIMEOUT_MS', '25000')),
  // Register slash commands automatically on startup (used by the Docker
  // deployment so there's no separate `npm run deploy` step).
  autoDeployCommands: /^(1|true|yes)$/i.test(optional('AUTO_DEPLOY_COMMANDS', '')),
});
