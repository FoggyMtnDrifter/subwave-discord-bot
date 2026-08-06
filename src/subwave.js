// Thin client for the SUB/WAVE HTTP API. Every route is unauthenticated; the
// controller mounts them under `/api` on the station origin. Only the handful of
// endpoints this bot needs are wrapped here.
//
//   GET  /api/now-playing   → current track + station context + stream descriptor
//   POST /api/request       → submit a free-text request, returns { requestId }
//   GET  /api/request/:id   → poll a request outcome
//   GET  /api/cover/:id     → cover-art proxy (used to build image URLs)
import { config } from './config.js';

const { apiUrl, baseUrl } = config.subwave;

async function getJson(path, { timeoutMs = 8000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${apiUrl}${path}`, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`GET ${path} → HTTP ${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch the live now-playing feed.
 * @returns the raw payload: { nowPlaying, context, dj, activeShow, listeners,
 *          streamOnline, stream, timezone, ... } — or null on failure.
 */
export async function getNowPlaying() {
  try {
    return await getJson('/now-playing');
  } catch (err) {
    console.warn(`[subwave] now-playing fetch failed: ${err.message}`);
    return null;
  }
}

/**
 * Resolve the Icecast stream URL. Prefers an explicit override, otherwise uses
 * the mount reported by now-playing, falling back to the conventional mount.
 */
export async function resolveStreamUrl() {
  if (config.subwave.streamUrl) return config.subwave.streamUrl;
  const np = await getNowPlaying();
  const mount = np?.stream?.mount || '/stream.mp3';
  return `${baseUrl}${mount}`;
}

/** Build a cover-art URL for a Subsonic track id (or null if none). */
export function coverArtUrl(subsonicId) {
  return subsonicId ? `${apiUrl}/cover/${encodeURIComponent(subsonicId)}` : null;
}

/**
 * Submit a listener request. The controller returns a 202 receipt immediately
 * and resolves the pick asynchronously.
 * @returns { requestId } (throws on transport/HTTP error).
 */
export async function submitRequest({ text, name }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${apiUrl}/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ text, name }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      // 429 → rate-limited (per-IP cooldown / hourly cap / station-wide cap),
      // 503 → requests disabled or paused for zero listeners. Both carry a
      // friendly `message`; 429 also carries `retryAfter` seconds.
      const err = new Error(data.message || data.error || `HTTP ${res.status}`);
      err.status = res.status;
      err.retryAfter = typeof data.retryAfter === 'number' ? data.retryAfter : null;
      throw err;
    }
    return data; // { success, requestId, status }
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Are listener requests enabled on the station right now?
 *
 * There's no public settings read, so we probe: an empty-text POST /request is
 * rejected *before* the rate-limit gate (no side effects, no quota burned).
 * A 503 whose message says requests are closed means the operator's kill switch
 * (or requests.enabled=false) is on. Anything else — 400 (empty), 429
 * (rate-limited), or the zero-listener "autopilot" 503 — means the feature is
 * live. We fail open (return true) if the station is unreachable.
 */
export async function requestsEnabled() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${apiUrl}/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ text: '' }),
      signal: controller.signal,
    });
    if (res.status === 503) {
      const data = await res.json().catch(() => ({}));
      // "Requests are temporarily closed." → disabled. The zero-listener pause
      // ("…on autopilot — requests reopen when someone's tuned in.") is not.
      if (/closed/i.test(data.message || '')) return false;
    }
    return true;
  } catch (err) {
    console.warn(`[subwave] requestsEnabled probe failed (assuming enabled): ${err.message}`);
    return true;
  } finally {
    clearTimeout(timer);
  }
}

/** Poll a single request outcome. Returns the raw ledger entry. */
export async function getRequest(id) {
  return getJson(`/request/${encodeURIComponent(id)}`);
}

/**
 * Poll a submitted request until it leaves `pending`, or until the timeout.
 * Statuses walk: pending → resolved | rejected | failed. A 404 (status
 * "unknown") means stop polling.
 * @returns the terminal ledger entry, or the last-seen entry on timeout.
 */
export async function waitForRequest(id, { timeoutMs, intervalMs = 1500 } = {}) {
  const deadline = Date.now() + (timeoutMs ?? config.requestPollTimeoutMs);
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await getRequest(id);
    } catch (err) {
      // A 404 means the request id is unknown / expired — stop polling.
      if (/HTTP 404/.test(err.message)) {
        return last ?? { status: 'unknown' };
      }
      // Transient error — keep trying until the deadline.
    }
    if (last && last.status && last.status !== 'pending') {
      return last;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return last ?? { status: 'pending' };
}
