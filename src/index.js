// SUB/WAVE Discord bot — entry point.
//
// Wires up the gateway client, dispatches slash-command and modal interactions,
// runs the station watcher (which drives per-session announcements + voice
// status), leaves empty voice channels, and cleans up on shutdown.
import { Client, GatewayIntentBits, Events, MessageFlags } from 'discord.js';
import { config } from './config.js';
import { commands, modalHandlers } from './commands/index.js';
import { station, startStation, stopStation } from './station.js';
import { announceTrackChange, handleVoiceStateUpdate, stopAll } from './voice.js';
import { LIKE_PREFIX, handleLikeButton, setLikesEnabled } from './likes.js';
import { likesEnabled } from './subwave.js';
import { registerCommands } from './register.js';

// GuildVoiceStates is required to join voice and to detect an empty channel.
// No message-content intent is needed — everything is slash commands + modals.
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

client.once(Events.ClientReady, async (c) => {
  console.log(`✔ Logged in as ${c.user.tag}`);
  console.log(`  Station: ${config.subwave.baseUrl}`);

  if (config.autoDeployCommands) {
    try {
      const { scope, count, requestsEnabled } = await registerCommands();
      console.log(`✔ Auto-registered ${count} command(s) to ${scope}.`);
      if (!requestsEnabled) {
        console.log('  ℹ /request omitted — the station has requests disabled.');
      }
    } catch (err) {
      console.warn(`[deploy] auto command registration failed: ${err.message}`);
    }
  }

  // Hide the like button if the station has likes turned off.
  const likes = await likesEnabled();
  setLikesEnabled(likes);
  if (!likes) console.log('  ℹ Like button hidden — the station has likes disabled.');

  // Announce track changes to active voice sessions. Subscribe before the
  // watcher starts emitting.
  station.on('trackChange', (np) => announceTrackChange(np));
  startStation();
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const command = commands.get(interaction.commandName);
      if (command) await command.execute(interaction);
    } else if (interaction.isModalSubmit()) {
      const handler = modalHandlers.get(interaction.customId);
      if (handler) await handler(interaction);
    } else if (interaction.isButton()) {
      if (interaction.customId.startsWith(LIKE_PREFIX)) await handleLikeButton(interaction);
    }
  } catch (err) {
    console.error(`[interaction] ${interaction.commandName ?? interaction.customId} failed:`, err);
    const payload = {
      content: '⚠️ Something went wrong handling that.',
      flags: MessageFlags.Ephemeral,
    };
    try {
      if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
      else if (interaction.isRepliable()) await interaction.reply(payload);
    } catch {
      // Interaction token likely expired — nothing more we can do.
    }
  }
});

// Leave voice channels once the last human departs.
client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  handleVoiceStateUpdate(oldState, newState);
});

// Graceful shutdown: stop the watcher, drop voice sessions, log out.
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} received — shutting down.`);
  stopStation();
  stopAll();
  try {
    await client.destroy();
  } finally {
    process.exit(0);
  }
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

client.login(config.discord.token);
