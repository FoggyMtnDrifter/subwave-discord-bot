/**
 * /nowplaying — Show what's on air right now.
 * Also handles the "🔄 Refresh" and "🎤 Request a Song" button interactions.
 */

import { SlashCommandBuilder } from 'discord.js';
import { getNowPlaying } from '../subwave.js';
import player from '../player.js';
import {
  buildNowPlayingEmbed,
  buildNowPlayingActions,
  buildErrorEmbed,
} from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('nowplaying')
  .setDescription('Show what\'s currently on air — track, artist, listeners, mood.');

export async function execute(interaction) {
  await interaction.deferReply();

  let nowPlaying;
  try {
    nowPlaying = await getNowPlaying();
  } catch (err) {
    return interaction.editReply({
      embeds: [
        buildErrorEmbed(
          'Station Unavailable',
          `Could not reach the SUB/WAVE station: ${err.message}`
        ),
      ],
    });
  }

  const guildId     = interaction.guildId;
  const channelId   = player.getChannelId(guildId);
  const voiceChannel = channelId
    ? interaction.guild.channels.cache.get(channelId)
    : null;

  const embed = buildNowPlayingEmbed(nowPlaying, voiceChannel?.name);

  await interaction.editReply({
    embeds: [embed],
    components: [buildNowPlayingActions()],
  });

  const message = await interaction.fetchReply();
  player.registerMessage(guildId, message);
}
