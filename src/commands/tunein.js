// /tunein — hand out the direct stream links so listeners can open the station
// in Sonos, VLC, a browser, or a hardware radio without the bot in voice.
import {
  SlashCommandBuilder,
  InteractionContextType,
  ApplicationIntegrationType,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { resolveStreamUrl } from '../subwave.js';
import { config } from '../config.js';

export const data = new SlashCommandBuilder()
  .setName('tunein')
  .setDescription('Get direct links to listen to the station')
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
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const { baseUrl, stationName } = config.subwave;
  const streamUrl = await resolveStreamUrl();

  const embed = new EmbedBuilder()
    .setColor(0x1db954)
    .setTitle(`📻 Tune in to ${stationName}`)
    .setDescription(
      [
        `**Direct stream:** ${streamUrl}`,
        `**Playlist (.pls):** ${baseUrl}/listen.pls`,
        `**Playlist (.m3u):** ${baseUrl}/listen.m3u`,
        `**Web player:** ${baseUrl}`,
        '',
        'Paste the direct stream into VLC, Sonos, or a car receiver — or run `/play` in a server to hear it in a voice channel.',
      ].join('\n'),
    );

  await interaction.editReply({ embeds: [embed] });
}
