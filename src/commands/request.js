// /request — submit a free-text song request to the station's booth. The DJ
// interprets it, picks a track, and queues it. We submit, then poll for the
// outcome and report back with the matched track and queue position.
import {
  SlashCommandBuilder,
  InteractionContextType,
  ApplicationIntegrationType,
  EmbedBuilder,
} from 'discord.js';
import { submitRequest, waitForRequest } from '../subwave.js';
import { config } from '../config.js';

export const data = new SlashCommandBuilder()
  .setName('request')
  .setDescription('Ask the DJ to play something (e.g. "play some Bowie", "something slower")')
  .addStringOption((opt) =>
    opt
      .setName('text')
      .setDescription('What would you like to hear?')
      .setRequired(true)
      .setMaxLength(300),
  )
  .setContexts(
    InteractionContextType.Guild,
    InteractionContextType.BotDM,
    InteractionContextType.PrivateChannel,
  )
  .setIntegrationTypes(
    ApplicationIntegrationType.GuildInstall,
    ApplicationIntegrationType.UserInstall,
  );

export async function execute(interaction) {
  const text = interaction.options.getString('text', true);
  // Use the requester's display name so the DJ can shout them out.
  const name = interaction.user.displayName || interaction.user.username;

  await interaction.deferReply();

  let receipt;
  try {
    receipt = await submitRequest({ text, name });
  } catch (err) {
    const paused = err.status === 429;
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x9b1c1c)
          .setTitle('Request not accepted')
          .setDescription(
            paused
              ? "The booth isn't taking requests right now (rate-limited, or nobody's listening). Try again in a bit."
              : `Couldn't submit that request: ${err.message}`,
          ),
      ],
    });
    return;
  }

  // Let the requester know it's in, then poll for the resolution.
  const pending = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle('🎧 Request received')
    .setDescription(`Taking *"${text}"* to the booth…`);
  await interaction.editReply({ embeds: [pending] });

  const outcome = await waitForRequest(receipt.requestId, {
    timeoutMs: config.requestPollTimeoutMs,
  });

  const embed = new EmbedBuilder();
  if (outcome.status === 'resolved' && outcome.track) {
    embed
      .setColor(0x1db954)
      .setTitle('✅ Coming up')
      .setDescription(outcome.ack || 'Your request is queued.')
      .addFields({
        name: 'Track',
        value: `**${outcome.track.title}**${
          outcome.track.artist ? ` — ${outcome.track.artist}` : ''
        }`,
      });
    if (typeof outcome.queuePosition === 'number' && outcome.queuePosition > 0) {
      embed.addFields({
        name: 'Queue position',
        value: `#${outcome.queuePosition}`,
        inline: true,
      });
    }
  } else if (outcome.status === 'resolved') {
    // Resolved as a conversational reply (nothing queued).
    embed
      .setColor(0x1db954)
      .setTitle('💬 From the booth')
      .setDescription(outcome.ack || 'Heard you loud and clear.');
  } else if (outcome.status === 'rejected' || outcome.status === 'failed') {
    embed
      .setColor(0x9b1c1c)
      .setTitle("Couldn't find that")
      .setDescription(
        outcome.ack || outcome.message || "The booth couldn't find a match for that one.",
      );
  } else {
    // Still pending at timeout — it may yet land; don't claim failure.
    embed
      .setColor(0xf1c40f)
      .setTitle('🎧 Request in the booth')
      .setDescription(
        `*"${text}"* is still being worked out — listen in, it may be on its way.`,
      );
  }

  await interaction.editReply({ embeds: [embed] });
}
