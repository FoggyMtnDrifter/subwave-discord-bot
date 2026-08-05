// Rich-presence updater. A bot has a single global presence, so this reflects
// the station itself: it polls now-playing and sets the bot's activity to
// "Listening to <artist — title>". Everyone sees the same thing the station is
// airing, which is exactly the SUB/WAVE broadcast model.
import { ActivityType, PresenceUpdateStatus } from 'discord.js';
import { getNowPlaying } from './subwave.js';
import { config } from './config.js';

let timer = null;
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

async function tick(client) {
  const np = await getNowPlaying();
  const text = activityText(np);
  if (text === lastText) return; // avoid needless gateway churn
  lastText = text;

  client.user.setPresence({
    status: PresenceUpdateStatus.Online,
    activities: [
      {
        name: text,
        type: ActivityType.Listening,
      },
    ],
  });
}

/** Start the presence loop. Runs immediately, then every PRESENCE_INTERVAL_MS. */
export function startPresenceLoop(client) {
  const run = () => tick(client).catch((err) =>
    console.warn(`[presence] update failed: ${err.message}`),
  );
  run();
  timer = setInterval(run, config.presenceIntervalMs);
  timer.unref?.();
}

export function stopPresenceLoop() {
  if (timer) clearInterval(timer);
  timer = null;
}
