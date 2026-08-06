// /stop — leave the voice channel and stop broadcasting in this guild.
import {
  SlashCommandBuilder,
  InteractionContextType,
  ApplicationIntegrationType,
  MessageFlags,
} from 'discord.js';
import { stopPlayback, isPlaying } from '../voice.js';
import { noticeEmbed, COLORS } from '../embeds.js';

export const data = new SlashCommandBuilder()
  .setName('stop')
  .setDescription('Stop the broadcast and leave the voice channel')
  .setContexts(InteractionContextType.Guild)
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall);

export async function execute(interaction) {
  if (!isPlaying(interaction.guildId)) {
    await interaction.reply({
      embeds: [noticeEmbed('Stop', "I'm not broadcasting here right now.", COLORS.info)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  stopPlayback(interaction.guildId);
  await interaction.reply({
    embeds: [noticeEmbed('Stop', '👋 Stopped the broadcast and left the channel.', COLORS.info)],
  });
}
