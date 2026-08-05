// SUB/WAVE Discord bot — entry point.
//
// Wires up the gateway client, dispatches slash-command interactions, keeps the
// bot's rich presence in sync with the station, and cleans up voice sessions on
// shutdown.
import { Client, GatewayIntentBits, Events, MessageFlags } from 'discord.js';
import { config } from './config.js';
import { commands } from './commands/index.js';
import { startPresenceLoop, stopPresenceLoop } from './presence.js';
import { stopAll } from './voice.js';

// GuildVoiceStates is required to join/track voice channels. No message-content
// intent is needed — everything is driven by slash commands.
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

client.once(Events.ClientReady, (c) => {
  console.log(`✔ Logged in as ${c.user.tag}`);
  console.log(`  Station: ${config.subwave.baseUrl}`);
  startPresenceLoop(c);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const command = commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`[interaction] ${interaction.commandName} failed:`, err);
    const payload = {
      content: '⚠️ Something went wrong handling that command.',
      flags: MessageFlags.Ephemeral,
    };
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(payload);
      } else {
        await interaction.reply(payload);
      }
    } catch {
      // Interaction token likely expired — nothing more we can do.
    }
  }
});

// Graceful shutdown: drop voice sessions and the presence loop, then log out.
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} received — shutting down.`);
  stopPresenceLoop();
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
