/**
 * /stop — Leave the voice channel and stop streaming.
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import player from '../player.js';
import { buildErrorEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('stop')
  .setDescription('Leave the voice channel and stop streaming.');

export async function execute(interaction) {
  const guildId = interaction.guildId;
  const status  = player.getStatus(guildId);

  if (status === 'disconnected') {
    return interaction.reply({
      embeds: [buildErrorEmbed('Not Connected', "I'm not in a voice channel right now.")],
      ephemeral: true,
    });
  }

  player.leave(guildId);

  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle('⏹ Stream Stopped')
    .setDescription('Left the voice channel. Use `/play` to start again.')
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
