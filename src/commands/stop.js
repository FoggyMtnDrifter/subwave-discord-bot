// /stop — leave the voice channel and stop broadcasting in this guild.
import {
  SlashCommandBuilder,
  InteractionContextType,
  ApplicationIntegrationType,
  MessageFlags,
} from 'discord.js';
import { stopPlayback, isPlaying } from '../voice.js';

export const data = new SlashCommandBuilder()
  .setName('stop')
  .setDescription('Stop the broadcast and leave the voice channel')
  .setContexts(InteractionContextType.Guild)
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall);

export async function execute(interaction) {
  if (!isPlaying(interaction.guildId)) {
    await interaction.reply({
      content: "I'm not broadcasting here right now.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  stopPlayback(interaction.guildId);
  await interaction.reply({ content: '👋 Stopped the broadcast and left the channel.' });
}
