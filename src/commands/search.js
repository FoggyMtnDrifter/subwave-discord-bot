/**
 * /search — Search the SUB/WAVE music library and request a specific track.
 *
 * Requires ADMIN_USER + ADMIN_PASS (uses GET /dj/search).
 * If admin creds are not configured the command responds with a clear message.
 *
 * Flow:
 *   1. User invokes /search <query>
 *   2. Bot calls GET /dj/search?q=<query>
 *   3. Bot replies with a numbered embed of results + a select menu
 *   4. User picks a track from the select → bot calls POST /request with exact title
 */

import {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { searchLibrary, pollRequest } from '../subwave.js';
import {
  buildSearchResultEmbed,
  buildRequestPendingEmbed,
  buildRequestResultEmbed,
  buildErrorEmbed,
} from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('search')
  .setDescription('Search the music library and request a specific track.')
  .addStringOption((opt) =>
    opt
      .setName('query')
      .setDescription('Artist name, track title, or album')
      .setRequired(true)
      .setMinLength(2)
      .setMaxLength(100)
  );

export async function execute(interaction) {
  if (!process.env.ADMIN_USER || !process.env.ADMIN_PASS) {
    return interaction.reply({
      embeds: [
        buildErrorEmbed(
          'Search Unavailable',
          '`ADMIN_USER` and `ADMIN_PASS` must be configured to enable library search.'
        ),
      ],
      ephemeral: true,
    });
  }

  await interaction.deferReply();
  const query = interaction.options.getString('query');

  let results;
  try {
    const data = await searchLibrary(query);
    results = data?.results ?? [];
  } catch (err) {
    return interaction.editReply({
      embeds: [buildErrorEmbed('Search Failed', err.message)],
    });
  }

  const { embed, hasResults } = buildSearchResultEmbed(results, query);

  if (!hasResults) {
    return interaction.editReply({ embeds: [embed] });
  }

  // Build a select menu — limit to 10 (Discord max is 25, but keep UX clean)
  const options = results.slice(0, 10).map((track, i) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(`${track.title}`.slice(0, 100))
      .setDescription(`${track.artist}`.slice(0, 100))
      .setValue(String(i)) // we use index to look up in results later
  );

  const select = new StringSelectMenuBuilder()
    .setCustomId(`search_select:${interaction.id}`)
    .setPlaceholder('Select a track to request…')
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(select);

  const reply = await interaction.editReply({ embeds: [embed], components: [row] });

  // Collect the select interaction — give user 60s to pick
  const collector = reply.createMessageComponentCollector({
    filter: (i) =>
      i.customId === `search_select:${interaction.id}` &&
      i.user.id === interaction.user.id,
    time: 60_000,
    max: 1,
  });

  collector.on('collect', async (selectInteraction) => {
    const idx   = parseInt(selectInteraction.values[0], 10);
    const track = results[idx];
    if (!track) return;

    const requester = interaction.member?.displayName ?? interaction.user.username;
    // Use exact title so the DJ matches it precisely
    const requestText = `"${track.title}" by ${track.artist}`;

    await selectInteraction.update({
      embeds: [buildRequestPendingEmbed(requestText, requester)],
      components: [],
    });

    let result;
    try {
      result = await pollRequest(requestText, requester);
    } catch (err) {
      return selectInteraction.editReply({
        embeds: [buildErrorEmbed('Request Failed', err.message)],
      });
    }

    await selectInteraction.editReply({
      embeds: [buildRequestResultEmbed(result, requester)],
    });
  });

  collector.on('end', async (collected) => {
    if (collected.size === 0) {
      // Timed out — remove the select menu
      await interaction.editReply({ components: [] }).catch(() => {});
    }
  });
}
