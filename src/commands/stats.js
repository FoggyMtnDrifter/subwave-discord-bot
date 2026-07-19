/**
 * /stats — Show station health, listener count, current DJ persona, and show info.
 */

import { SlashCommandBuilder } from 'discord.js';
import { getHealth, getNowPlaying, getSchedule } from '../subwave.js';
import { buildStatsEmbed, buildErrorEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('stats')
  .setDescription('Show station health, listener count, and current show info.');

export async function execute(interaction) {
  await interaction.deferReply();

  let health, nowPlaying, schedule;

  try {
    [health, nowPlaying, schedule] = await Promise.all([
      getHealth().catch(() => ({ status: 'unknown' })),
      getNowPlaying().catch(() => null),
      getSchedule().catch(() => null),
    ]);
  } catch (err) {
    return interaction.editReply({
      embeds: [buildErrorEmbed('Station Unavailable', err.message)],
    });
  }

  const embed = buildStatsEmbed(health, nowPlaying, schedule);
  await interaction.editReply({ embeds: [embed] });
}
