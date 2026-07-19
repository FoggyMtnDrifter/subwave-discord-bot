/**
 * /play — Join the caller's current voice channel and start streaming.
 */

import { SlashCommandBuilder, ChannelType, EmbedBuilder } from 'discord.js';
import player from '../player.js';
import { buildNowPlayingEmbed, buildNowPlayingActions, buildErrorEmbed } from '../utils/embeds.js';
import { getNowPlaying } from '../subwave.js';

export const data = new SlashCommandBuilder()
  .setName('play')
  .setDescription('Join your voice channel and start streaming SUB/WAVE radio.')
  .addChannelOption((opt) =>
    opt
      .setName('channel')
      .setDescription('Voice channel to join (defaults to your current channel)')
      .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
      .setRequired(false)
  );

export async function execute(interaction) {
  await interaction.deferReply();

  // Resolve voice channel
  const targetChannel =
    interaction.options.getChannel('channel') ??
    interaction.member?.voice?.channel;

  if (!targetChannel) {
    return interaction.editReply({
      embeds: [
        buildErrorEmbed(
          'No Voice Channel',
          'You need to be in a voice channel, or specify one with the `channel` option.'
        ),
      ],
    });
  }

  if (!targetChannel.joinable) {
    return interaction.editReply({
      embeds: [
        buildErrorEmbed(
          'Cannot Join Channel',
          `I don't have permission to join **${targetChannel.name}**.`
        ),
      ],
    });
  }

  try {
    await player.join(targetChannel);
  } catch (err) {
    return interaction.editReply({
      embeds: [
        buildErrorEmbed(
          'Connection Failed',
          `Failed to join the voice channel: ${err.message}`
        ),
      ],
    });
  }

  // Fetch and display now-playing
  let nowPlaying = null;
  try {
    nowPlaying = await getNowPlaying();
  } catch {
    // Non-fatal — stream is playing even if we can't fetch metadata
  }

  let embed;
  if (nowPlaying) {
    embed = buildNowPlayingEmbed(nowPlaying, targetChannel.name);
  } else {
    embed = new EmbedBuilder()
      .setColor(0x1db954)
      .setTitle(`▶ Streaming in #${targetChannel.name}`)
      .setDescription('Connected to the SUB/WAVE radio stream.')
      .setTimestamp();
  }

  await interaction.editReply({
    embeds: [embed],
    components: [buildNowPlayingActions()],
  });

  const message = await interaction.fetchReply();
  player.registerMessage(interaction.guildId, message);
}
