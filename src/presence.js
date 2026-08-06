// Rich-presence updater. A bot has a single global presence, so this reflects
// the station itself: it sets the bot's activity to "Listening to <artist —
// title>". Everyone sees the same thing the station is airing, which is exactly
// the SUB/WAVE broadcast model.
//
// Driven by the shared station watcher (station.js) rather than its own poll.
import { ActivityType, PresenceUpdateStatus } from 'discord.js';
import { config } from './config.js';
import { station } from './station.js';

let lastText = null;

function activityText(np) {
  const track = np?.nowPlaying;
  if (!np || np.streamOnline === false) {
    return `${config.subwave.stationName} — offline`;
  }
  if (track?.title) {
    return track.artist ? `${track.artist} — ${track.title}` : track.title;
  }
  return config.subwave.stationName;
}

/** Subscribe the bot's presence to the station watcher's updates. */
export function startPresenceLoop(client) {
  station.on('update', (np) => {
    const text = activityText(np);
    if (text === lastText) return; // avoid needless gateway churn
    lastText = text;

    client.user.setPresence({
      status: PresenceUpdateStatus.Online,
      activities: [{ name: text, type: ActivityType.Listening }],
    });
  });
}

// The station watcher owns the timer now; kept for API symmetry with index.js.
export function stopPresenceLoop() {}
