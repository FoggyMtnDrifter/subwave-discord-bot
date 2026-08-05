// Per-guild voice playback of the SUB/WAVE Icecast stream.
//
// A radio stream is a single, never-ending source, so the model here is simple:
// one AudioPlayer per guild, fed by an ffmpeg process that pulls the Icecast
// mount and emits raw 48kHz stereo PCM. If ffmpeg dies or the player falls idle
// (an Icecast hiccup, a mid-song reconnect), we transparently respawn — the
// listener just hears the stream resume.
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
import { resolveStreamUrl } from './subwave.js';

// guildId → { connection, player, ffmpeg, streamUrl, stopping }
const sessions = new Map();

// Spawn ffmpeg to transcode the live stream into Discord-ready raw PCM.
// The reconnect flags keep a 24/7 radio feed alive across brief network drops.
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

// Build (or rebuild) the audio resource for a session and hand it to the player.
function feed(session) {
  if (session.stopping) return;

  // Tear down any previous ffmpeg before starting a fresh one.
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
    // A non-deliberate exit means the stream dropped — respawn shortly unless
    // we're tearing the session down.
    if (!session.stopping) {
      console.warn(
        `[voice:${session.guildId}] ffmpeg exited (${code}); restarting stream in 2s`,
      );
      session.restartTimer = setTimeout(() => feed(session), 2000);
    }
  });

  const resource = createAudioResource(ffmpeg.stdout, {
    inputType: StreamType.Raw,
  });
  session.player.play(resource);
}

/**
 * Join the given voice channel and start broadcasting the station there.
 * @param channel a GuildVoiceChannel the invoking member is in.
 * @returns { streamUrl }
 */
export async function startPlayback(channel) {
  const guildId = channel.guild.id;
  const streamUrl = await resolveStreamUrl();

  // Already live in this guild → just make sure we're in the right channel.
  const existing = sessions.get(guildId);
  if (existing) {
    existing.streamUrl = streamUrl;
    if (existing.connection.joinConfig.channelId !== channel.id) {
      existing.connection.rejoin({
        channelId: channel.id,
        selfDeaf: true,
        selfMute: false,
      });
    }
    return { streamUrl, resumed: true };
  }

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId,
    adapterCreator: channel.guild.voiceAdapterCreator,
    selfDeaf: true,
    selfMute: false,
  });

  const player = createAudioPlayer();
  connection.subscribe(player);

  const session = { guildId, connection, player, ffmpeg: null, streamUrl, stopping: false };
  sessions.set(guildId, session);

  // If the player ever reports Idle (source ended / stalled), re-feed it.
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

  // Handle being moved/disconnected: try to recover, otherwise clean up.
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5000),
      ]);
      // Reconnecting — let it ride.
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
  return { streamUrl, resumed: false };
}

/** Stop broadcasting and leave the voice channel in a guild. */
export function stopPlayback(guildId) {
  const session = sessions.get(guildId);
  if (!session) {
    // Nothing tracked, but make sure no stray connection lingers.
    const stray = getVoiceConnection(guildId);
    if (stray) stray.destroy();
    return false;
  }
  session.stopping = true;
  clearTimeout(session.restartTimer);
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
