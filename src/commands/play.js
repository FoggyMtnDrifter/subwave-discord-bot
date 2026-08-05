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
import { getNowPlaying } from '../subwave.js';
import { nowPlayingEmbed } from './embed.js';

export const data = new SlashCommandBuilder()
  .setName('play')
  .setDescription('Play the station live in your voice channel')
  .setContexts(InteractionContextType.Guild)
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall);

export async function execute(interaction) {
  const member = interaction.member;
  const channel = member?.voice?.channel;

  if (!channel) {
    await interaction.reply({
      content: '🔇 Join a voice channel first, then run `/play`.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (
    channel.type !== ChannelType.GuildVoice &&
    channel.type !== ChannelType.GuildStageVoice
  ) {
    await interaction.reply({
      content: "I can't broadcast in that kind of channel.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Make sure we can actually join and speak.
  const perms = channel.permissionsFor(interaction.client.user);
  if (!perms?.has(PermissionFlagsBits.Connect) || !perms?.has(PermissionFlagsBits.Speak)) {
    await interaction.reply({
      content: `I need **Connect** and **Speak** permissions in ${channel}.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply();

  try {
    const { resumed } = await startPlayback(channel);
    const np = await getNowPlaying();
    const embed = nowPlayingEmbed(np).setAuthor({
      name: resumed
        ? `📻 Already broadcasting in ${channel.name}`
        : `📻 Broadcasting in ${channel.name}`,
    });
    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error(`[play] ${err.message}`);
    await interaction.editReply({
      content: `⚠️ Couldn't start the broadcast: ${err.message}`,
    });
  }
}
