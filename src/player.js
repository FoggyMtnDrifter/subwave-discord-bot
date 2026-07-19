/**
 * player.js — Voice player manager.
 *
 * Maintains one VoiceConnection + AudioPlayer per guild.
 * Each guild opens its own HTTP connection to the Icecast stream so that
 * SUB/WAVE counts every connected Discord server as an independent listener.
 *
 * Usage:
 *   import player from './player.js';
 *   await player.join(voiceChannel);
 *   player.leave(guildId);
 *   player.getStatus(guildId); // 'connected' | 'disconnected' | 'reconnecting'
 */

import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  StreamType,
  getVoiceConnection,
} from '@discordjs/voice';

import fetch from 'node-fetch';
import { createLogger } from './utils/logger.js';
import { getNowPlaying } from './subwave.js';
import { buildNowPlayingEmbed, buildNowPlayingActions } from './utils/embeds.js';

const logger = createLogger('player');

const STREAM_URL = process.env.SUBWAVE_STREAM_URL;

if (!STREAM_URL) {
  throw new Error('SUBWAVE_STREAM_URL is not set. Add it to your .env file.');
}

// ── State ─────────────────────────────────────────────────────────────────────

/** @type {Map<string, { connection: import('@discordjs/voice').VoiceConnection, player: import('@discordjs/voice').AudioPlayer, channelId: string, reconnecting: boolean }>} */
const sessions = new Map();

const RECONNECT_DELAY_MS = 5_000;
const MAX_RECONNECT_ATTEMPTS = 10;

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Create a fresh AudioResource from the Icecast stream.
 * Each call opens a new HTTP connection → each guild registers as a listener.
 */
async function createStreamResource() {
  logger.info(`Opening Icecast stream: ${STREAM_URL}`);
  const response = await fetch(STREAM_URL, {
    headers: {
      // Identify as the Discord bot so logs are readable in Icecast
      'User-Agent': 'SubwaveDiscordBot/1.0',
      // Don't inject metadata chunks into the audio stream (causes decoding glitches)
      'Icy-MetaData': '0',
    },
  });

  if (!response.ok) {
    throw new Error(`Icecast stream returned ${response.status}`);
  }

  return createAudioResource(response.body, {
    inputType: StreamType.Arbitrary,
    inlineVolume: false,
  });
}

/**
 * Attach all event listeners to a VoiceConnection and AudioPlayer pair for a guild.
 */
function attachSessionHandlers(guildId, connection, audioPlayer) {
  let reconnectAttempts = 0;

  // ── Voice connection state machine ──

  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    const session = sessions.get(guildId);
    if (!session) return;

    session.reconnecting = true;
    logger.warn(`[${guildId}] Voice disconnected. Attempting to reconnect...`);

    try {
      // Discord.js recommends trying to rejoin before giving up
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
      // Reconnected at voice level — stream will resume via player idle handler
    } catch {
      // Could not reconnect at voice level — destroy and recreate
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        logger.warn(`[${guildId}] Voice reconnect attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);
        setTimeout(() => rejoinVoice(guildId), RECONNECT_DELAY_MS);
      } else {
        logger.error(`[${guildId}] Max reconnect attempts reached. Cleaning up.`);
        cleanupSession(guildId);
      }
    }
  });

  connection.on(VoiceConnectionStatus.Destroyed, () => {
    logger.info(`[${guildId}] Voice connection destroyed.`);
    sessions.delete(guildId);
  });

  connection.on('error', (err) => {
    logger.error(`[${guildId}] Voice connection error: ${err.message}`);
  });

  // ── Audio player state machine ──

  audioPlayer.on(AudioPlayerStatus.Idle, async () => {
    const session = sessions.get(guildId);
    if (!session) return;

    logger.info(`[${guildId}] Stream ended or paused. Restarting in ${RECONNECT_DELAY_MS}ms...`);
    await new Promise((r) => setTimeout(r, RECONNECT_DELAY_MS));

    try {
      const resource = await createStreamResource();
      audioPlayer.play(resource);
      session.reconnecting = false;
      reconnectAttempts = 0;
      logger.info(`[${guildId}] Stream restarted.`);
    } catch (err) {
      logger.error(`[${guildId}] Failed to restart stream: ${err.message}`);
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        // Trigger idle again after a short delay
        setTimeout(() => audioPlayer.emit(AudioPlayerStatus.Idle), RECONNECT_DELAY_MS);
      }
    }
  });

  audioPlayer.on('error', (err) => {
    logger.error(`[${guildId}] Audio player error: ${err.message}`);
    // Idle handler will pick this up
  });

  audioPlayer.on(AudioPlayerStatus.Playing, () => {
    logger.info(`[${guildId}] ▶ Now streaming.`);
    const session = sessions.get(guildId);
    if (session) session.reconnecting = false;
  });
}

/**
 * Attempt to rejoin the same voice channel after a connection failure.
 */
async function rejoinVoice(guildId) {
  const session = sessions.get(guildId);
  if (!session) return;

  try {
    // The existing connection may be in a bad state — destroy and recreate
    const existing = getVoiceConnection(guildId);
    if (existing) existing.destroy();
  } catch {}

  // We store the full voiceChannel reference — re-use it
  if (session._voiceChannel) {
    logger.info(`[${guildId}] Rejoining voice channel...`);
    try {
      await joinAndPlay(session._voiceChannel);
    } catch (err) {
      logger.error(`[${guildId}] Rejoin failed: ${err.message}`);
    }
  }
}

function cleanupSession(guildId) {
  const session = sessions.get(guildId);
  if (session && session.refreshInterval) {
    clearInterval(session.refreshInterval);
  }
  try {
    const existing = getVoiceConnection(guildId);
    if (existing) existing.destroy();
  } catch {}
  sessions.delete(guildId);
}

/**
 * Core join-and-play logic shared by join() and rejoin().
 */
async function joinAndPlay(voiceChannel) {
  const guildId = voiceChannel.guild.id;

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false,
  });

  const audioPlayer = createAudioPlayer();
  connection.subscribe(audioPlayer);
  attachSessionHandlers(guildId, connection, audioPlayer);

  // Wait until the connection is ready before playing
  await entersState(connection, VoiceConnectionStatus.Ready, 30_000);

  const resource = await createStreamResource();
  audioPlayer.play(resource);

  sessions.set(guildId, {
    connection,
    player: audioPlayer,
    channelId: voiceChannel.id,
    reconnecting: false,
    _voiceChannel: voiceChannel,
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

const player = {
  /**
   * Join a voice channel and start streaming the radio.
   * If the bot is already in this guild, it moves to the new channel.
   *
   * @param {import('discord.js').VoiceChannel} voiceChannel
   */
  async join(voiceChannel) {
    const guildId = voiceChannel.guild.id;

    // Already in this channel — nothing to do
    const existing = sessions.get(guildId);
    if (existing && existing.channelId === voiceChannel.id) {
      return;
    }

    // In a different channel — destroy old connection first
    if (existing) {
      cleanupSession(guildId);
    }

    await joinAndPlay(voiceChannel);
    logger.info(`[${guildId}] Joined #${voiceChannel.name}`);
  },

  /**
   * Leave the voice channel for this guild and clean up.
   * @param {string} guildId
   */
  leave(guildId) {
    const session = sessions.get(guildId);
    if (!session) return;

    session.player.stop();
    cleanupSession(guildId);
    logger.info(`[${guildId}] Left voice channel.`);
  },

  /**
   * @param {string} guildId
   * @returns {'connected' | 'reconnecting' | 'disconnected'}
   */
  getStatus(guildId) {
    const session = sessions.get(guildId);
    if (!session) return 'disconnected';
    return session.reconnecting ? 'reconnecting' : 'connected';
  },

  /**
   * @param {string} guildId
   * @returns {string | null} Current voice channel ID or null
   */
  getChannelId(guildId) {
    return sessions.get(guildId)?.channelId ?? null;
  },

  /**
   * Returns all active guild IDs.
   * @returns {string[]}
   */
  getActiveGuilds() {
    return [...sessions.keys()];
  },

  /**
   * Register a now-playing message to be automatically refreshed every 10 seconds.
   *
   * @param {string} guildId
   * @param {import('discord.js').Message} message
   */
  registerMessage(guildId, message) {
    const session = sessions.get(guildId);
    if (!session) return;

    if (session.refreshInterval) {
      clearInterval(session.refreshInterval);
    }

    session.nowPlayingMessage = message;

    session.refreshInterval = setInterval(async () => {
      const currentSession = sessions.get(guildId);
      if (!currentSession || !currentSession.nowPlayingMessage) {
        clearInterval(session.refreshInterval);
        return;
      }

      try {
        const nowPlaying = await getNowPlaying();
        const voiceChannel = currentSession._voiceChannel;
        const embed = buildNowPlayingEmbed(nowPlaying, voiceChannel?.name);

        await currentSession.nowPlayingMessage.edit({
          embeds: [embed],
          components: [buildNowPlayingActions()],
        });
      } catch (err) {
        logger.error(`[${guildId}] Auto-refresh failed: ${err.message}`);
        // If the message was deleted (10008) or bot lacks permission (50001)
        if (err.code === 10008 || err.code === 50001) {
          logger.info(`[${guildId}] Stopping auto-refresh.`);
          clearInterval(session.refreshInterval);
          if (sessions.has(guildId)) {
            sessions.get(guildId).nowPlayingMessage = null;
          }
        }
      }
    }, 10_000);
  },
};

export default player;
