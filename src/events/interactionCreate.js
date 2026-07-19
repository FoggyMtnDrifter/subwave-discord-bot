/**
 * interactionCreate.js — Routes commands, buttons, and modal submissions.
 */

import { Events } from 'discord.js';
import { createLogger } from '../utils/logger.js';
import { handleModalSubmit } from '../commands/request.js';
import { getNowPlaying } from '../subwave.js';
import player from '../player.js';
import { buildNowPlayingEmbed, buildNowPlayingActions, buildErrorEmbed } from '../utils/embeds.js';

const logger = createLogger('interactionCreate');

export const name = Events.InteractionCreate;

export async function execute(interaction) {
  // ── Slash Commands ──
  if (interaction.isChatInputCommand()) {
    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      logger.info(`Command /${interaction.commandName} by ${interaction.user.tag}`);
      await command.execute(interaction);
    } catch (err) {
      logger.error(`Error executing /${interaction.commandName}: ${err.message}`);
      const errEmbed = buildErrorEmbed('Command Error', 'An error occurred while executing this command.');
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ embeds: [errEmbed], components: [] });
      } else {
        await interaction.reply({ embeds: [errEmbed], ephemeral: true });
      }
    }
  }

  // ── Modal Submissions ──
  else if (interaction.isModalSubmit()) {
    if (interaction.customId === 'song_request_modal') {
      try {
        await handleModalSubmit(interaction);
      } catch (err) {
        logger.error(`Error handling modal submit: ${err.message}`);
        const errEmbed = buildErrorEmbed('Request Error', err.message);
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ embeds: [errEmbed], components: [] });
        } else {
          await interaction.reply({ embeds: [errEmbed], ephemeral: true });
        }
      }
    }
  }

  // ── Button Clicks ──
  else if (interaction.isButton()) {
    try {
      // 1. Refresh now playing card
      if (interaction.customId === 'refresh_now_playing') {
        await interaction.deferUpdate();
        const nowPlaying = await getNowPlaying();
        const channelId = player.getChannelId(interaction.guildId);
        const voiceChannel = channelId
          ? interaction.guild.channels.cache.get(channelId)
          : null;

        const embed = buildNowPlayingEmbed(nowPlaying, voiceChannel?.name);
        await interaction.editReply({
          embeds: [embed],
          components: [buildNowPlayingActions()],
        });
      }

      // 2. Open request modal directly from button click
      else if (interaction.customId === 'open_request_modal') {
        const command = interaction.client.commands.get('request');
        if (command) {
          await command.execute(interaction);
        }
      }
    } catch (err) {
      logger.error(`Error handling button click ${interaction.customId}: ${err.message}`);
    }
  }
}
