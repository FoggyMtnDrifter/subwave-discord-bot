/**
 * index.js — Bot entry point.
 * Loads environment variables, commands, events, and logins.
 */

import 'dotenv/config';
import { Client, GatewayIntentBits, Collection } from 'discord.js';
import { createLogger } from './utils/logger.js';

// Import commands
import * as play from './commands/play.js';
import * as stop from './commands/stop.js';
import * as request from './commands/request.js';
import * as search from './commands/search.js';

// Import events
import * as ready from './events/ready.js';
import * as interactionCreate from './events/interactionCreate.js';
import * as voiceStateUpdate from './events/voiceStateUpdate.js';

const logger = createLogger('main');

// Verify configuration
if (!process.env.DISCORD_TOKEN) {
  logger.error('DISCORD_TOKEN is missing from .env');
  process.exit(1);
}
if (!process.env.SUBWAVE_URL) {
  logger.error('SUBWAVE_URL is missing from .env');
  process.exit(1);
}
if (!process.env.SUBWAVE_STREAM_URL) {
  logger.error('SUBWAVE_STREAM_URL is missing from .env');
  process.exit(1);
}

// Instantiate Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
  ],
});

// Setup commands registry
client.commands = new Collection();
const commandList = [play, stop, request, search];

for (const cmd of commandList) {
  if (cmd.data?.name) {
    client.commands.set(cmd.data.name, cmd);
  }
}

// Setup event listeners
const eventsList = [ready, interactionCreate, voiceStateUpdate];

for (const ev of eventsList) {
  if (ev.once) {
    client.once(ev.name, (...args) => ev.execute(...args));
  } else {
    client.on(ev.name, (...args) => ev.execute(...args));
  }
}

// Catch unhandled errors gracefully
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
});

// Login
client.login(process.env.DISCORD_TOKEN).catch((err) => {
  logger.error(`Discord login failed: ${err.message}`);
  process.exit(1);
});
