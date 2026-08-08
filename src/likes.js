// Track likes.
//
// SUB/WAVE only likes the currently-airing track and dedups per listener IP, so
// the bot lands at most one like per airing on the station itself. Locally we
// track how many distinct Discord users tapped like for each track (keyed by
// its subsonic id) and surface that count on the button. In-memory by design —
// counts reset on restart, same as the station's own ephemeral tallies.
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { likeTrack } from './subwave.js';

export const LIKE_PREFIX = 'subwave:like:';

const likesByTrack = new Map(); // trackId → Set<userId>
const sentToStation = new Set(); // trackIds we've already liked on the station

// Whether the station has likes enabled (checked once at startup). When off, no
// like button is rendered — mirrors how /request is hidden when requests are off.
let stationLikesEnabled = true;
export function setLikesEnabled(enabled) {
  stationLikesEnabled = enabled !== false;
}

export function likeCount(trackId) {
  return likesByTrack.get(trackId)?.size ?? 0;
}

// Toggle a user's like for a track; returns the new state + count.
function toggleLike(trackId, userId) {
  let set = likesByTrack.get(trackId);
  if (!set) {
    set = new Set();
    likesByTrack.set(trackId, set);
  }
  const liked = !set.has(userId);
  if (liked) set.add(userId);
  else set.delete(userId);
  return { liked, count: set.size };
}

function buildRow(trackId, count) {
  const button = new ButtonBuilder()
    .setCustomId(`${LIKE_PREFIX}${trackId}`)
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('❤️')
    .setLabel(count > 0 ? String(count) : 'Like');
  return new ActionRowBuilder().addComponents(button);
}

/**
 * Components for a now-playing card: a like button carrying the current count,
 * or none when the item isn't likeable (a jingle/segment with no subsonic id).
 */
export function likeComponents(np) {
  if (!stationLikesEnabled) return [];
  const id = np?.nowPlaying?.subsonic_id;
  return id ? [buildRow(id, likeCount(id))] : [];
}

/** Handle a like-button click: bump the local count, like on the station once. */
export async function handleLikeButton(interaction) {
  const trackId = interaction.customId.slice(LIKE_PREFIX.length);
  if (!trackId) return;

  const { liked, count } = toggleLike(trackId, interaction.user.id);
  // Respond fast (the 3s window) by editing just the button — the embed stays.
  await interaction.update({ components: [buildRow(trackId, count)] });

  // Forward a single like to the station the first time this track is liked
  // here. It only lands while the track is still on air; an old card's like
  // 409s and simply isn't marked sent, so it can still land on a later airing.
  if (liked && !sentToStation.has(trackId)) {
    if (await likeTrack(trackId)) sentToStation.add(trackId);
  }
}
