/**
 * /queue — Show the upcoming track queue from SUB/WAVE.
 */

import { SlashCommandBuilder } from 'discord.js';
import { getState } from '../subwave.js';
import { buildQueueEmbed, buildErrorEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('queue')
  .setDescription('Show the upcoming track queue.');

export async function execute(interaction) {
  await interaction.deferReply();

  let state;
  try {
    state = await getState();
  } catch (err) {
    return interaction.editReply({
      embeds: [buildErrorEmbed('Station Unavailable', err.message)],
    });
  }

  const embed = buildQueueEmbed(state);
  await interaction.editReply({ embeds: [embed] });
}
