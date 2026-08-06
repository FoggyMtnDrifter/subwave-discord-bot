// /request — opens a form (modal) for a free-text song request, submits it to
// the station's booth, then polls for the outcome and reports the matched track.
import {
  SlashCommandBuilder,
  InteractionContextType,
  ApplicationIntegrationType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from 'discord.js';
import { submitRequest, waitForRequest } from '../subwave.js';
import { baseEmbed, noticeEmbed, COLORS } from '../embeds.js';
import { config } from '../config.js';

export const MODAL_ID = 'subwave:request';

export const data = new SlashCommandBuilder()
  .setName('request')
  .setDescription('Ask the DJ to play something')
  .setContexts(
    InteractionContextType.Guild,
    InteractionContextType.BotDM,
    InteractionContextType.PrivateChannel,
  )
  .setIntegrationTypes(
    ApplicationIntegrationType.GuildInstall,
    ApplicationIntegrationType.UserInstall,
  );

// The slash command just opens the form. A modal must be the first response to
// the interaction, so there's no defer here.
export async function execute(interaction) {
  const input = new TextInputBuilder()
    .setCustomId('text')
    .setLabel('What would you like to hear?')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('e.g. play some Bowie · something slower · more like this')
    .setRequired(true)
    .setMaxLength(300);

  const modal = new ModalBuilder()
    .setCustomId(MODAL_ID)
    .setTitle('Request a track')
    .addComponents(new ActionRowBuilder().addComponents(input));

  await interaction.showModal(modal);
}

// Handles the submitted form: submit → poll → report.
export async function handleModal(interaction) {
  const text = interaction.fields.getTextInputValue('text').trim();
  const name = interaction.user.displayName || interaction.user.username;

  await interaction.deferReply();

  let receipt;
  try {
    receipt = await submitRequest({ text, name });
  } catch (err) {
    const paused = err.status === 429;
    await interaction.editReply({
      embeds: [
        noticeEmbed(
          'Request',
          paused
            ? "The booth isn't taking requests right now (rate-limited, or nobody's listening). Try again in a bit."
            : `Couldn't submit that request: ${err.message}`,
          COLORS.error,
        ),
      ],
    });
    return;
  }

  await interaction.editReply({
    embeds: [
      noticeEmbed('Request', `🎧 Taking *"${text}"* to the booth…`, COLORS.pending),
    ],
  });

  const outcome = await waitForRequest(receipt.requestId, {
    timeoutMs: config.requestPollTimeoutMs,
  });

  let embed;
  if (outcome.status === 'resolved' && outcome.track) {
    embed = baseEmbed('Request', COLORS.live)
      .setTitle('✅ Coming up')
      .setDescription(outcome.ack || 'Your request is queued.')
      .addFields({
        name: 'Track',
        value: `**${outcome.track.title}**${
          outcome.track.artist ? ` — ${outcome.track.artist}` : ''
        }`,
      });
    if (typeof outcome.queuePosition === 'number' && outcome.queuePosition > 0) {
      embed.addFields({ name: 'Queue position', value: `#${outcome.queuePosition}`, inline: true });
    }
  } else if (outcome.status === 'resolved') {
    embed = noticeEmbed('Request', outcome.ack || 'Heard you loud and clear.', COLORS.live)
      .setTitle('💬 From the booth');
  } else if (outcome.status === 'rejected' || outcome.status === 'failed') {
    embed = noticeEmbed(
      'Request',
      outcome.ack || outcome.message || "The booth couldn't find a match for that one.",
      COLORS.error,
    ).setTitle("Couldn't find that");
  } else {
    embed = noticeEmbed(
      'Request',
      `*"${text}"* is still being worked out — listen in, it may be on its way.`,
      COLORS.pending,
    ).setTitle('🎧 Still in the booth');
  }

  await interaction.editReply({ embeds: [embed] });
}
