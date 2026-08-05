// /nowplaying — show what the station is airing right now. Works anywhere the
// app is reachable (guild, bot DM, or private channel; guild- or user-install).
import {
  SlashCommandBuilder,
  InteractionContextType,
  ApplicationIntegrationType,
} from 'discord.js';
import { getNowPlaying } from '../subwave.js';
import { nowPlayingEmbed } from './embed.js';

export const data = new SlashCommandBuilder()
  .setName('nowplaying')
  .setDescription('Show the track the station is playing right now')
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
  await interaction.deferReply();
  const np = await getNowPlaying();
  await interaction.editReply({ embeds: [nowPlayingEmbed(np)] });
}
