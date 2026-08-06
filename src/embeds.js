// Shared embed styling. Every command and every auto-announcement builds its
// embeds through here so the bot reads as one consistent surface: same colored
// rail, same author "Context" label, same footer treatment.
import { EmbedBuilder } from 'discord.js';
import { coverArtUrl } from './subwave.js';

// One palette, used by meaning (not per-command). Keep these stable.
export const COLORS = {
  live: 0x1db954, // on-air / success — green
  info: 0x5865f2, // neutral information — blurple
  pending: 0xf1c40f, // in-progress — amber
  error: 0xed4245, // failure — red
  offline: 0x4e5058, // off air / unavailable — grey
};

/**
 * The shell every embed shares: color rail + a short context label as the
 * author line. Specific builders extend this. (No station name — the bot's
 * identity already carries that.)
 */
export function baseEmbed(context, color = COLORS.info) {
  return new EmbedBuilder().setColor(color).setAuthor({ name: context });
}

/** A simple one-line embed for confirmations, validation, and errors. */
export function noticeEmbed(context, description, color = COLORS.info) {
  return baseEmbed(context, color).setDescription(description);
}

// Join a list of names as natural English: "A", "A & B", "A, B & C".
function joinNames(names) {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

// "Show with Host & Guest(s)" when a show is on air; otherwise just the on-air
// DJ persona. Shows can carry more than one guest host.
function showCredit(np) {
  const show = np?.activeShow;
  if (show?.name) {
    const host = show.persona?.name;
    const guests = (show.guests || []).map((g) => g?.name ?? g).filter(Boolean);
    const people = [host, ...guests].filter(Boolean);
    return people.length ? `${show.name} with ${joinNames(people)}` : show.name;
  }
  return np?.dj?.name || null;
}

/**
 * The canonical track card — reused by /play and the on-song-change
 * announcement so "now playing" looks identical wherever it appears.
 */
export function trackEmbed(np, { context = 'Now Playing' } = {}) {
  if (!np) {
    return baseEmbed(context, COLORS.offline).setDescription(
      "Couldn't reach the station right now — try again shortly.",
    );
  }
  if (np.streamOnline === false) {
    return baseEmbed('Off Air', COLORS.offline).setDescription(
      'The station is currently offline.',
    );
  }

  const track = np.nowPlaying || {};
  const embed = baseEmbed(context, COLORS.live).setTitle(track.title || 'Unknown track');

  const lines = [];
  if (track.artist) lines.push(`**Artist:** ${track.artist}`);
  if (track.album) lines.push(`**Album:** ${track.album}`);
  if (track.genre) lines.push(`**Genre:** ${track.genre}`);
  if (Array.isArray(track.moods) && track.moods.length) {
    lines.push(`**Mood:** ${track.moods.join(', ')}`);
  }
  if (lines.length) embed.setDescription(lines.join('\n'));

  const cover = coverArtUrl(track.subsonic_id);
  if (cover) embed.setThumbnail(cover);

  // Footer: the show/DJ credit, plus a live listener count when known.
  const credit = showCredit(np);
  const listeners =
    typeof np.listeners === 'number'
      ? `${np.listeners} listener${np.listeners === 1 ? '' : 's'}`
      : null;
  const footer = [credit, listeners].filter(Boolean).join(' • ');
  if (footer) embed.setFooter({ text: footer });

  return embed;
}
