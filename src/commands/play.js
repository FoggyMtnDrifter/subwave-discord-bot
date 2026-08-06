// /play — join the invoking member's voice channel and broadcast the station
// there. Voice requires the bot to be a real member of the guild, so this is a
// guild-install, guild-context command.
import {
  SlashCommandBuilder,
  InteractionContextType,
  ApplicationIntegrationType,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
} from 'discord.js';
import { startPlayback } from '../voice.js';
import { getCurrent } from '../station.js';
import { getNowPlaying } from '../subwave.js';
import { trackEmbed, noticeEmbed, COLORS } from '../embeds.js';

export const data = new SlashCommandBuilder()
  .setName('play')
  .setDescription('Play the station live in your voice channel')
  .setContexts(InteractionContextType.Guild)
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall);

// Reply to a validation failure with a consistent ephemeral embed.
function reject(interaction, message) {
  return interaction.reply({
    embeds: [noticeEmbed('Play', message, COLORS.error)],
    flags: MessageFlags.Ephemeral,
  });
}

export async function execute(interaction) {
  const channel = interaction.member?.voice?.channel;

  if (!channel) {
    return reject(interaction, '🔇 Join a voice channel first, then run `/play`.');
  }
  if (
    channel.type !== ChannelType.GuildVoice &&
    channel.type !== ChannelType.GuildStageVoice
  ) {
    return reject(interaction, "I can't broadcast in that kind of channel.");
  }

  const perms = channel.permissionsFor(interaction.client.user);
  if (!perms?.has(PermissionFlagsBits.Connect) || !perms?.has(PermissionFlagsBits.Speak)) {
    return reject(interaction, `I need **Connect** and **Speak** permissions in ${channel}.`);
  }

  await interaction.deferReply();

  try {
    await startPlayback(channel, interaction.channelId);
    const np = getCurrent() ?? (await getNowPlaying());
    await interaction.editReply({ embeds: [trackEmbed(np)] });
  } catch (err) {
    console.error(`[play] ${err.message}`);
    await interaction.editReply({
      embeds: [noticeEmbed('Play', `⚠️ Couldn't start the broadcast: ${err.message}`, COLORS.error)],
    });
  }
}
