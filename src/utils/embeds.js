/**
 * embeds.js — Rich Discord embed builders for SUB/WAVE data.
 *
 * All embeds use the SUB/WAVE brand palette:
 *   Primary   #5865F2 (Discord blurple — used for interactive embeds)
 *   On-air    #1DB954 (green — "live" indicator)
 *   Neutral   #2B2D31 (dark background)
 *   Error     #ED4245 (Discord red)
 */

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const COLOR_ONAIR  = 0x1db954; // green  — playing
const COLOR_BRAND  = 0x5865f2; // blurple — general info
const COLOR_ERROR  = 0xed4245; // red    — errors
const COLOR_QUEUE  = 0xf0a500; // amber  — queue

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(seconds) {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function moodEmoji(mood) {
  const map = {
    energetic: '⚡', upbeat: '🌟', chill: '🌊', mellow: '🕯️',
    dark: '🌑', romantic: '🌹', focus: '🎯', hype: '🔥',
  };
  return map[mood?.toLowerCase()] ?? '🎵';
}

function listenerLabel(count) {
  if (count == null) return '';
  return count === 1 ? '1 listener' : `${count} listeners`;
}

// ── Embeds ────────────────────────────────────────────────────────────────────

/**
 * Build the "Now Playing" embed shown by /nowplaying.
 *
 * @param {object} nowPlaying — response from GET /now-playing
 * @param {string} [channelName] — voice channel name (optional)
 */
export function buildNowPlayingEmbed(response, channelName) {
  const track = response?.nowPlaying ?? {};
  const dj = response?.dj ?? {};
  const stationName = dj.station ?? 'SUB/WAVE Radio';
  const mood = response?.context?.dominantMood ?? (track.moods?.length ? track.moods[0] : null);

  // Resolve listener count (SUB/WAVE returns { current, peak } object)
  const rawListeners = response?.listeners;
  const listenerCount = (typeof rawListeners === 'object' && rawListeners !== null)
    ? (rawListeners.current ?? rawListeners.total ?? rawListeners.count)
    : rawListeners;

  // Build a sleek, single-column description block
  const lines = [
    `👤 **Artist:** ${track.artist ?? 'Unknown Artist'}`,
  ];
  if (track.album) {
    lines.push(`💿 **Album:** *${track.album}*`);
  }
  if (track.duration) {
    lines.push(`⏱️ **Duration:** ${formatDuration(track.duration)}`);
  }

  lines.push(
    '',
    `🎙️ **DJ:** ${dj.name ?? 'SUB/WAVE DJ'}`,
    `${moodEmoji(mood)} **Mood:** ${mood ?? '—'}`,
    `👥 **Listeners:** ${listenerLabel(listenerCount) || '0 listeners'}`
  );

  const embed = new EmbedBuilder()
    .setColor(COLOR_ONAIR)
    .setAuthor({
      name: `🔴 LIVE ON ${stationName.toUpperCase()}`,
      iconURL: 'https://www.getsubwave.com/favicon.png',
    })
    .setTitle(track.title ?? 'Unknown Track')
    .setDescription(lines.join('\n'))
    .setTimestamp()
    .setFooter({
      text: channelName ? `Streaming in #${channelName}` : 'SUB/WAVE · AI Radio',
    });

  // Cover art proxies through controller at /api/cover/:subsonic_id
  if (track.subsonic_id) {
    const baseUrl = process.env.SUBWAVE_URL?.replace(/\/$/, '');
    embed.setThumbnail(`${baseUrl}/api/cover/${track.subsonic_id}`);
  }

  return embed;
}

/**
 * Build the queue embed shown by /queue.
 *
 * @param {object} state — response from GET /state
 */
export function buildQueueEmbed(state) {
  const queue = state?.queue ?? [];

  const embed = new EmbedBuilder()
    .setColor(COLOR_QUEUE)
    .setTitle('🎶 Upcoming Queue');

  if (queue.length === 0) {
    embed.setDescription('_The queue is empty — the AI DJ is picking next._');
    return embed;
  }

  const lines = queue.slice(0, 10).map((item, i) => {
    const num = String(i + 1).padStart(2, '0');
    const by  = item.requestedBy ? ` _(requested by ${item.requestedBy})_` : '';
    return `\`${num}\` **${item.title ?? 'Unknown'}** — ${item.artist ?? ''}${by}`;
  });

  if (queue.length > 10) {
    lines.push(`_…and ${queue.length - 10} more_`);
  }

  embed.setDescription(lines.join('\n')).setTimestamp();
  return embed;
}

/**
 * Build the station stats embed shown by /stats.
 *
 * @param {object} health     — response from GET /health
 * @param {object} nowPlaying — response from GET /now-playing
 * @param {object} schedule   — response from GET /schedule (optional)
 */
export function buildStatsEmbed(health, nowPlaying, schedule) {
  const isOnAir     = health?.status === 'on-air';
  const listeners   = nowPlaying?.listeners?.total ?? 0;
  const dj          = nowPlaying?.dj ?? {};
  const station     = nowPlaying?.station ?? {};
  const currentShow = schedule?.currentShow;

  const statusLine = isOnAir
    ? '🟢 **On air**'
    : '🔴 **Offline**';

  const embed = new EmbedBuilder()
    .setColor(isOnAir ? COLOR_ONAIR : COLOR_ERROR)
    .setAuthor({
      name: station.name ?? 'SUB/WAVE Radio',
      iconURL: 'https://www.getsubwave.com/favicon.png',
    })
    .setTitle('📡 Station Stats')
    .addFields(
      { name: 'Status',    value: statusLine,               inline: true  },
      { name: 'Listeners', value: String(listeners),        inline: true  },
      { name: 'DJ',        value: dj.name ?? '—',           inline: true  }
    )
    .setTimestamp()
    .setFooter({ text: 'SUB/WAVE · AI Radio' });

  if (currentShow) {
    embed.addFields({ name: '📻 Current Show', value: currentShow.name ?? '—', inline: false });
  }

  if (dj.persona) {
    embed.addFields({ name: '🎭 Persona', value: dj.persona, inline: true });
  }

  return embed;
}

/**
 * Build the error embed.
 *
 * @param {string} title
 * @param {string} description
 */
export function buildErrorEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(COLOR_ERROR)
    .setTitle(`❌ ${title}`)
    .setDescription(description)
    .setTimestamp();
}

/**
 * Build the "Request submitted" processing embed.
 */
export function buildRequestPendingEmbed(requestText, requesterName) {
  return new EmbedBuilder()
    .setColor(COLOR_BRAND)
    .setTitle('🎤 Request Sent to the DJ')
    .setDescription(
      `The AI DJ is working on your request…\n\n> ${requestText}`
    )
    .addFields({ name: 'Requested by', value: requesterName, inline: true })
    .setFooter({ text: 'This usually takes 5–30 seconds' })
    .setTimestamp();
}

/**
 * Build the "Request resolved" embed.
 *
 * @param {object} result   — resolved request object from GET /request/:id
 * @param {string} requester
 */
export function buildRequestResultEmbed(result, requester) {
  const matched = result.status === 'resolved';

  const embed = new EmbedBuilder()
    .setColor(matched ? COLOR_ONAIR : COLOR_ERROR)
    .setTitle(matched ? '✅ Request Queued!' : '❌ Request Rejected')
    .setTimestamp();

  if (matched && result.track) {
    embed.setDescription(
      `**${result.track.title}** by ${result.track.artist}`
    );
    if (result.queuePosition != null) {
      embed.addFields({
        name: '📋 Queue Position',
        value: `#${result.queuePosition}`,
        inline: true,
      });
    }
  } else if (!matched) {
    embed.setDescription(result.message ?? 'The DJ could not find or queue that request.');
  }

  const djSay = result.ack ?? result.djMessage;
  if (djSay) {
    embed.addFields({ name: '🎙️ DJ says…', value: `_${djSay}_`, inline: false });
  }

  embed.addFields({ name: 'Requested by', value: requester, inline: true });

  return embed;
}

/**
 * Build the now-playing action row (request button).
 */
export function buildNowPlayingActions() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('open_request_modal')
      .setLabel('🎤 Request a Song')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('refresh_now_playing')
      .setLabel('🔄 Refresh')
      .setStyle(ButtonStyle.Secondary)
  );
}

/**
 * Build search result action row with a select for track IDs.
 *
 * @param {Array<{id: string, title: string, artist: string}>} tracks
 */
export function buildSearchResultEmbed(tracks, query) {
  const embed = new EmbedBuilder()
    .setColor(COLOR_BRAND)
    .setTitle(`🔍 Search: "${query}"`)
    .setTimestamp();

  if (!tracks || tracks.length === 0) {
    embed.setDescription('_No tracks found._');
    return { embed, hasResults: false };
  }

  const lines = tracks.slice(0, 10).map((t, i) => {
    const num = String(i + 1).padStart(2, '0');
    return `\`${num}\` **${t.title}** — ${t.artist}`;
  });

  embed.setDescription(lines.join('\n'));

  return { embed, hasResults: true };
}
