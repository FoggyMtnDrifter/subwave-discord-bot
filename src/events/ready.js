/**
 * ready.js — Fires once when the bot successfully connects to Discord.
 */

import { Events, ActivityType } from 'discord.js';
import { createLogger } from '../utils/logger.js';
import { getNowPlaying } from '../subwave.js';

const logger = createLogger('ready');

export const name = Events.ClientReady;
export const once = true;

export async function execute(client) {
  logger.info(`Logged in as ${client.user.tag}`);

  // Function to fetch active song and set presence
  const updatePresence = async () => {
    try {
      const response = await getNowPlaying();
      const track = response?.nowPlaying;

      if (track && track.title && track.artist) {
        client.user.setPresence({
          activities: [
            {
              name: `${track.title} - ${track.artist}`,
              type: ActivityType.Listening,
            },
          ],
          status: 'online',
        });
      } else {
        setDefaultPresence(client);
      }
    } catch {
      // Fallback on network/API errors
      setDefaultPresence(client);
    }
  };

  // Set initial presence immediately
  setDefaultPresence(client);
  await updatePresence();

  // Poll every 15 seconds for track changes
  setInterval(updatePresence, 15_000);

  logger.info(`Ready. Serving ${client.guilds.cache.size} guild(s).`);
}

function setDefaultPresence(client) {
  client.user.setPresence({
    activities: [
      {
        name: 'SUB/WAVE Radio',
        type: ActivityType.Listening,
      },
    ],
    status: 'online',
  });
}
