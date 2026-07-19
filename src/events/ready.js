/**
 * ready.js — Fires once when the bot successfully connects to Discord.
 */

import { Events, ActivityType } from 'discord.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('ready');

export const name = Events.ClientReady;
export const once = true;

export async function execute(client) {
  logger.info(`Logged in as ${client.user.tag}`);

  // Set activity to show the station is streaming
  client.user.setPresence({
    activities: [
      {
        name: 'SUB/WAVE Radio',
        type: ActivityType.Streaming,
        url: process.env.SUBWAVE_URL ?? 'https://www.getsubwave.com',
      },
    ],
    status: 'online',
  });

  logger.info(`Ready. Serving ${client.guilds.cache.size} guild(s).`);
}
