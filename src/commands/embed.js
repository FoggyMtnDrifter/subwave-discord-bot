// Shared builder for the "now playing" embed, reused by /nowplaying and the
// /play confirmation so the station's current track always looks the same.
import { EmbedBuilder } from 'discord.js';
import { coverArtUrl } from '../subwave.js';
import { config } from '../config.js';

export function nowPlayingEmbed(np) {
  const station = config.subwave.stationName;

  if (!np) {
    return new EmbedBuilder()
      .setColor(0x2b2d31)
      .setTitle(station)
      .setDescription("Couldn't reach the station right now — try again shortly.");
  }

  const track = np.nowPlaying || {};
  const online = np.streamOnline !== false;

  const embed = new EmbedBuilder()
    .setColor(online ? 0x1db954 : 0x9b1c1c)
    .setAuthor({ name: `${station} • Now Playing` });

  if (!online) {
    return embed
      .setColor(0x9b1c1c)
      .setTitle('Off air')
      .setDescription('The station is currently offline.');
  }

  embed.setTitle(track.title || 'Unknown track');

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

  const footer = [];
  if (np.dj?.name) footer.push(`DJ ${np.dj.name}`);
  if (np.activeShow?.name) footer.push(np.activeShow.name);
  if (typeof np.listeners === 'number') {
    footer.push(`${np.listeners} listener${np.listeners === 1 ? '' : 's'}`);
  }
  if (footer.length) embed.setFooter({ text: footer.join(' • ') });

  return embed;
}
