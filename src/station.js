// The station watcher — one poller, one source of truth for "what's on air".
//
// SUB/WAVE is a single global broadcast, so a single timer polls now-playing and
// emits 'trackChange' (np) only when the track actually changes — which drives
// the per-session channel announcements and voice-channel status. getCurrent()
// exposes the latest payload for one-off reads (e.g. the /play confirmation).
import { EventEmitter } from 'node:events';
import { getNowPlaying } from './subwave.js';
import { config } from './config.js';

export const station = new EventEmitter();

let timer = null;
let lastKey = null;
let current = null;

// A stable key for the on-air item, so we only fire 'trackChange' on real
// transitions (including going on/off air) rather than every poll.
function trackKey(np) {
  const t = np?.nowPlaying;
  if (t?.title) return `${t.artist || ''}|${t.title}`;
  return np?.streamOnline === false ? '__offline__' : '__none__';
}

/** The most recent now-playing payload (or null before the first poll). */
export function getCurrent() {
  return current;
}

async function tick() {
  const np = await getNowPlaying().catch(() => null);
  current = np;
  const key = trackKey(np);
  if (key !== lastKey) {
    lastKey = key;
    station.emit('trackChange', np);
  }
}

/** Begin polling. Runs immediately, then every STATION_POLL_INTERVAL_MS. */
export function startStation() {
  tick();
  timer = setInterval(tick, config.stationPollIntervalMs);
  timer.unref?.();
}

export function stopStation() {
  if (timer) clearInterval(timer);
  timer = null;
}
