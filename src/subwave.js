/**
 * subwave.js — API client for the SUB/WAVE controller.
 *
 * All public endpoints are unauthenticated. Admin-gated endpoints (search)
 * use HTTP Basic auth from ADMIN_USER / ADMIN_PASS env vars. If those are
 * unset, admin calls throw with a clear message.
 *
 * Ports (default SUB/WAVE layout):
 *   Controller : SUBWAVE_URL (port 7701 in dev, proxied to / in prod)
 *   Icecast    : SUBWAVE_STREAM_URL (port 7702)
 */

import fetch from 'node-fetch';

const BASE_URL = process.env.SUBWAVE_URL?.replace(/\/$/, '');

if (!BASE_URL) {
  throw new Error('SUBWAVE_URL is not set. Add it to your .env file.');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function adminAuthHeader() {
  const user = process.env.ADMIN_USER;
  const pass = process.env.ADMIN_PASS;
  if (!user || !pass) {
    throw new Error(
      'ADMIN_USER and ADMIN_PASS must be set in .env to use admin endpoints.'
    );
  }
  return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
}

async function apiGet(path, { admin = false } = {}) {
  const headers = admin ? { Authorization: adminAuthHeader() } : {};
  const res = await fetch(`${BASE_URL}${path}`, { headers });
  if (!res.ok) {
    throw new Error(`SUB/WAVE API error ${res.status} on ${path}`);
  }
  return res.json();
}

async function apiPost(path, body, { admin = false } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(admin ? { Authorization: adminAuthHeader() } : {}),
  };
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`SUB/WAVE API error ${res.status} on ${path}: ${text}`);
  }
  return res.json();
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * GET /health
 * Returns { status: "on-air" } when the stack is fully up.
 */
export async function getHealth() {
  return apiGet('/api/health');
}

/**
 * GET /now-playing
 * Returns the current track, listener counts, mood, weather context.
 *
 * Shape (relevant fields):
 * {
 *   track: { title, artist, album, duration, albumArtUrl },
 *   listeners: { total },
 *   mood: string,
 *   dj: { name, persona },
 *   station: { name }
 * }
 */
export async function getNowPlaying() {
  return apiGet('/api/now-playing');
}

/**
 * GET /state
 * Returns the upcoming queue, recent play history, and the DJ booth log.
 *
 * Shape (relevant fields):
 * {
 *   queue: [{ title, artist, requestedBy? }],
 *   history: [{ title, artist, playedAt }],
 *   boothLog: [{ message, timestamp }]
 * }
 */
export async function getState() {
  return apiGet('/api/state');
}

/**
 * GET /schedule
 * Returns the show schedule, personas, and weekly grid.
 */
export async function getSchedule() {
  return apiGet('/api/schedule');
}

/**
 * POST /request
 * Submit a natural-language song request.
 * Returns { id, message } (202 — the DJ resolves it asynchronously).
 *
 * @param {string} text      — e.g. "something upbeat by Radiohead"
 * @param {string} requester — display name of the requester
 */
export async function submitRequest(text, requester = 'Discord listener') {
  return apiPost('/api/request', { text, name: requester });
}

/**
 * GET /request/:id
 * Poll the status of a submitted request.
 *
 * Status values: "pending" | "matched" | "queued" | "rejected"
 *
 * Resolved shape:
 * { id, status, track?: { title, artist }, queuePosition?, djMessage? }
 */
export async function getRequestStatus(id) {
  return apiGet(`/api/request/${id}`);
}

/**
 * pollRequest — submit and then poll until resolved or timeout.
 *
 * @param {string} text
 * @param {string} requester
 * @param {number} maxWaitMs — default 50 000 ms (50s)
 * @returns {{ status, track?, queuePosition?, djMessage? }}
 */
export async function pollRequest(text, requester, maxWaitMs = 50_000) {
  const receipt = await submitRequest(text, requester);
  const id = receipt.requestId || receipt.id;

  const deadline = Date.now() + maxWaitMs;
  const POLL_INTERVAL = 2_000;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
    const status = await getRequestStatus(id);

    if (status.status !== 'pending') {
      return status;
    }
  }

  // Timeout — return the last known status
  return getRequestStatus(id);
}

/**
 * GET /dj/search?q=...
 * Search the music library. Requires admin credentials.
 *
 * Returns { results: [{ id, title, artist, album, duration }] }
 */
export async function searchLibrary(query) {
  const encoded = encodeURIComponent(query);
  return apiGet(`/api/dj/search?q=${encoded}`, { admin: true });
}

/**
 * POST /dj/queue-track
 * Queue a specific track by its library ID. Requires admin credentials.
 *
 * @param {string} trackId
 */
export async function queueTrack(trackId) {
  return apiPost('/api/dj/queue-track', { trackId }, { admin: true });
}
