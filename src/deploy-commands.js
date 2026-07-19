/**
 * deploy-commands.js — One-shot script to register slash commands with Discord.
 *
 * Usage:
 *   node src/deploy-commands.js
 *
 * If GUILD_ID is set in .env, commands register instantly for that server only.
 * Otherwise, they register globally, which can take up to 1 hour to propagate.
 */

import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { createLogger } from './utils/logger.js';

// Import command definitions
import * as play from './commands/play.js';
import * as stop from './commands/stop.js';
import * as nowplaying from './commands/nowplaying.js';
import * as request from './commands/request.js';
import * as search from './commands/search.js';
import * as stats from './commands/stats.js';
import * as queue from './commands/queue.js';

const logger = createLogger('deploy-commands');

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId) {
  logger.error('Missing DISCORD_TOKEN or CLIENT_ID in environment.');
  process.exit(1);
}

const commands = [
  play.data.toJSON(),
  stop.data.toJSON(),
  nowplaying.data.toJSON(),
  request.data.toJSON(),
  search.data.toJSON(),
  stats.data.toJSON(),
  queue.data.toJSON(),
];

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    logger.info(`Started refreshing ${commands.length} application (/) commands.`);

    if (guildId) {
      // Guild-scoped deploy (instant)
      logger.info(`Deploying commands to guild: ${guildId}`);
      await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commands }
      );
      logger.info('Successfully reloaded application (/) commands for development guild.');
    } else {
      // Global deploy (takes up to 1 hour)
      logger.info('Deploying commands globally.');
      await rest.put(
        Routes.applicationCommands(clientId),
        { body: commands }
      );
      logger.info('Successfully reloaded application (/) commands globally.');
    }
  } catch (err) {
    logger.error(`Failed to deploy commands: ${err.message}`);
    console.error(err);
  }
})();
