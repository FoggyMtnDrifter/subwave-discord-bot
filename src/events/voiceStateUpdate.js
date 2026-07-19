/**
 * voiceStateUpdate.js — Autoleave handler.
 * Automatically makes the bot leave the voice channel when it is the only user left.
 */

import { Events } from 'discord.js';
import player from '../player.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('voiceStateUpdate');

export const name = Events.VoiceStateUpdate;

export async function execute(oldState, newState) {
  const guildId = oldState.guild.id;
  const channelId = player.getChannelId(guildId);

  // If we aren't connected to a voice channel in this guild, ignore
  if (!channelId) return;

  // Track if anyone left the channel we are currently streaming in
  if (oldState.channelId === channelId && newState.channelId !== channelId) {
    const channel = oldState.channel;
    if (!channel) return;

    // Filter out bots to count real members
    const members = channel.members.filter((m) => !m.user.bot);

    if (members.size === 0) {
      logger.info(`[${guildId}] Voice channel #${channel.name} is empty. Leaving in 5 seconds...`);
      
      // Wait 5 seconds to prevent leaving on transient updates or reconnections
      setTimeout(() => {
        // Double check members after 5 seconds
        const currentChannel = oldState.guild.channels.cache.get(channelId);
        if (currentChannel) {
          const activeMembers = currentChannel.members.filter((m) => !m.user.bot);
          if (activeMembers.size === 0) {
            logger.info(`[${guildId}] Voice channel still empty. Leaving.`);
            player.leave(guildId);
          }
        }
      }, 5_000);
    }
  }
}
