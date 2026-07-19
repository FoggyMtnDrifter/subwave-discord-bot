/**
 * /request — Open a Discord Modal for submitting a natural-language song request.
 *
 * Flow:
 *   1. User invokes /request
 *   2. Bot shows a Modal with a text input
 *   3. User submits the modal
 *   4. Bot POSTs to SUB/WAVE /request and polls for the result
 *   5. Bot replies with the DJ's response + queue position
 */

import {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from 'discord.js';
import { pollRequest } from '../subwave.js';
import {
  buildRequestPendingEmbed,
  buildRequestResultEmbed,
  buildErrorEmbed,
} from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('request')
  .setDescription('Request a song from the AI DJ.');

export async function execute(interaction) {
  // Show the modal — the response is handled in interactionCreate
  const modal = buildRequestModal();
  await interaction.showModal(modal);
}

/**
 * Handle the modal submit. Called from interactionCreate.js.
 */
export async function handleModalSubmit(interaction) {
  const requestText = interaction.fields.getTextInputValue('request_text').trim();
  const requester   = interaction.member?.displayName ?? interaction.user.username;

  // Defer with a loading reply — polling can take up to 50s
  await interaction.deferReply();

  await interaction.editReply({
    embeds: [buildRequestPendingEmbed(requestText, requester)],
  });

  let result;
  try {
    result = await pollRequest(requestText, requester);
  } catch (err) {
    return interaction.editReply({
      embeds: [
        buildErrorEmbed(
          'Request Failed',
          `Could not submit your request: ${err.message}`
        ),
      ],
    });
  }

  await interaction.editReply({
    embeds: [buildRequestResultEmbed(result, requester)],
  });
}

function buildRequestModal() {
  const modal = new ModalBuilder()
    .setCustomId('song_request_modal')
    .setTitle('🎤 Request a Song');

  const textInput = new TextInputBuilder()
    .setCustomId('request_text')
    .setLabel('What would you like to hear?')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(
      'e.g. "something chill by Radiohead" or "more upbeat tracks"'
    )
    .setRequired(true)
    .setMinLength(3)
    .setMaxLength(200);

  modal.addComponents(new ActionRowBuilder().addComponents(textInput));
  return modal;
}
