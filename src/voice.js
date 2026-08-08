// Per-guild voice playback of the SUB/WAVE Icecast stream, plus the session's
// live surface: now-playing announcements in the channel /play was run from,
// the voice channel's status line, and auto-leave when the channel empties.
//
// A radio stream is a single, never-ending source, so playback is simple: one
// AudioPlayer per guild fed by an ffmpeg process that pulls the Icecast mount
// and emits raw 48kHz stereo PCM. If ffmpeg dies or the player falls idle we
// transparently respawn — the listener just hears the stream resume.
import { spawn } from 'node:child_process';
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  StreamType,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection,
} from '@discordjs/voice';
import { Routes, PermissionFlagsBits } from 'discord.js';
import { resolveStreamUrl } from './subwave.js';
import { getCurrent } from './station.js';
import { trackEmbed } from './embeds.js';
import { likeComponents } from './likes.js';
import { config } from './config.js';

// Leave a voice channel this long after the last human leaves.
const EMPTY_GRACE_MS = 30_000;

// guildId → session bag
const sessions = new Map();

// ── ffmpeg / audio ───────────────────────────────────────────

function spawnFfmpeg(streamUrl) {
  return spawn(
    'ffmpeg',
    [
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      '-i', streamUrl,
      '-loglevel', 'error',
      '-vn',
      '-f', 's16le',
      '-ar', '48000',
      '-ac', '2',
      'pipe:1',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
}

function feed(session) {
  if (session.stopping) return;

  if (session.ffmpeg) {
    session.ffmpeg.removeAllListeners();
    session.ffmpeg.kill('SIGKILL');
  }

  const ffmpeg = spawnFfmpeg(session.streamUrl);
  session.ffmpeg = ffmpeg;

  ffmpeg.stderr.on('data', (d) => {
    const msg = d.toString().trim();
    if (msg) console.warn(`[voice:${session.guildId}] ffmpeg: ${msg}`);
  });
  ffmpeg.on('error', (err) => {
    console.error(`[voice:${session.guildId}] ffmpeg spawn error: ${err.message}`);
  });
  ffmpeg.on('close', (code) => {
    if (!session.stopping) {
      console.warn(`[voice:${session.guildId}] ffmpeg exited (${code}); restarting in 2s`);
      session.restartTimer = setTimeout(() => feed(session), 2000);
    }
  });

  const resource = createAudioResource(ffmpeg.stdout, { inputType: StreamType.Raw });
  session.player.play(resource);
}

// ── voice channel status ("🎵 Artist — Title" under the channel) ─

function statusText(np) {
  const t = np?.nowPlaying;
  if (np?.streamOnline === false || !t?.title) return `🎵 ${config.subwave.stationName}`;
  return t.artist ? `🎵 ${t.artist} — ${t.title}` : `🎵 ${t.title}`;
}

async function setVoiceStatus(session, np) {
  const status = statusText(np);
  if (status === session.lastStatus) return;

  // Skip quietly if we lack the permission, rather than erroring every poll.
  const channel = session.client.channels.cache.get(session.voiceChannelId);
  const perms = channel?.permissionsFor(session.client.user);
  if (perms && !perms.has(PermissionFlagsBits.SetVoiceChannelStatus)) return;

  session.lastStatus = status;
  try {
    await session.client.rest.put(Routes.channelVoiceStatus(session.voiceChannelId), {
      body: { status },
    });
  } catch (err) {
    console.warn(`[voice:${session.guildId}] set voice status failed: ${err.message}`);
  }
}

function clearVoiceStatus(session) {
  session.client.rest
    .put(Routes.channelVoiceStatus(session.voiceChannelId), { body: { status: '' } })
    .catch(() => {});
}

// ── track-change fan-out (called by the station watcher) ─────

/**
 * On every track change, refresh each active session's voice-channel status and
 * post a now-playing card to the channel that session's /play was run from.
 */
export async function announceTrackChange(np) {
  for (const session of sessions.values()) {
    setVoiceStatus(session, np).catch(() => {});

    // Only announce real tracks — no "off air"/"nothing" spam.
    if (!np?.nowPlaying?.title || !session.textChannelId) continue;
    try {
      const channel = await session.client.channels.fetch(session.textChannelId);
      if (channel?.isTextBased()) {
        await channel.send({
          embeds: [trackEmbed(np, { context: 'Now Playing' })],
          components: likeComponents(np),
        });
      }
    } catch (err) {
      console.warn(`[voice:${session.guildId}] announce failed: ${err.message}`);
    }
  }
}

// ── empty-channel auto-leave ─────────────────────────────────

function humansIn(channel) {
  return channel ? channel.members.filter((m) => !m.user.bot).size : 0;
}

/** Wired to the client's voiceStateUpdate: leave once the channel is empty. */
export function handleVoiceStateUpdate(oldState, newState) {
  const guild = (newState ?? oldState).guild;
  const session = sessions.get(guild.id);
  if (!session) return;

  const vc = guild.channels.cache.get(session.voiceChannelId);
  if (!vc) return; // channel not in cache — don't treat as empty (kick/delete is handled by the Disconnected watcher)
  if (humansIn(vc) === 0) {
    if (!session.emptyTimer) {
      session.emptyTimer = setTimeout(() => {
        console.log(`[voice:${guild.id}] voice channel empty — leaving`);
        stopPlayback(guild.id);
      }, EMPTY_GRACE_MS);
      session.emptyTimer.unref?.();
    }
  } else if (session.emptyTimer) {
    clearTimeout(session.emptyTimer);
    session.emptyTimer = null;
  }
}

// ── lifecycle ────────────────────────────────────────────────

/**
 * Join `voiceChannel` and broadcast the station there. `textChannelId` is the
 * channel /play was invoked in — where song-change cards get posted.
 * @returns { streamUrl, resumed }
 */
export async function startPlayback(voiceChannel, textChannelId) {
  const guildId = voiceChannel.guild.id;
  const streamUrl = await resolveStreamUrl();

  const existing = sessions.get(guildId);
  if (existing) {
    existing.streamUrl = streamUrl;
    existing.textChannelId = textChannelId;
    if (existing.connection.joinConfig.channelId !== voiceChannel.id) {
      existing.voiceChannelId = voiceChannel.id;
      existing.connection.rejoin({ channelId: voiceChannel.id, selfDeaf: true, selfMute: false });
    }
    setVoiceStatus(existing, getCurrent()).catch(() => {});
    return { streamUrl, resumed: true };
  }

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: true,
    selfMute: false,
  });

  const player = createAudioPlayer();
  connection.subscribe(player);

  const session = {
    guildId,
    client: voiceChannel.client,
    connection,
    player,
    ffmpeg: null,
    streamUrl,
    stopping: false,
    voiceChannelId: voiceChannel.id,
    textChannelId,
    restartTimer: null,
    emptyTimer: null,
    lastStatus: null,
  };
  sessions.set(guildId, session);

  player.on(AudioPlayerStatus.Idle, () => {
    if (!session.stopping) {
      console.warn(`[voice:${guildId}] player idle; re-feeding stream`);
      feed(session);
    }
  });
  player.on('error', (err) => {
    console.error(`[voice:${guildId}] player error: ${err.message}`);
    if (!session.stopping) feed(session);
  });

  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5000),
      ]);
    } catch {
      stopPlayback(guildId);
    }
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 20000);
  } catch (err) {
    stopPlayback(guildId);
    throw new Error(`Could not connect to the voice channel: ${err.message}`);
  }

  feed(session);
  setVoiceStatus(session, getCurrent()).catch(() => {});
  return { streamUrl, resumed: false };
}

/** Stop broadcasting and leave the voice channel in a guild. */
export function stopPlayback(guildId) {
  const session = sessions.get(guildId);
  if (!session) {
    const stray = getVoiceConnection(guildId);
    if (stray) stray.destroy();
    return false;
  }
  session.stopping = true;
  clearTimeout(session.restartTimer);
  clearTimeout(session.emptyTimer);
  clearVoiceStatus(session);
  try {
    session.player.stop(true);
  } catch {}
  if (session.ffmpeg) {
    session.ffmpeg.removeAllListeners();
    session.ffmpeg.kill('SIGKILL');
  }
  try {
    session.connection.destroy();
  } catch {}
  sessions.delete(guildId);
  return true;
}

/** Is the bot currently broadcasting in this guild? */
export function isPlaying(guildId) {
  return sessions.has(guildId);
}

/** Tear down every active session (used on shutdown). */
export function stopAll() {
  for (const guildId of [...sessions.keys()]) stopPlayback(guildId);
}
