// Register slash commands with Discord. Run this once after editing commands:
//
//   npm run deploy
//
// With DISCORD_DEV_GUILD_ID set, commands register to that guild instantly
// (handy while developing). Without it, they register globally — which is what
// you want in production, but can take up to ~1h to propagate the first time.
import { REST, Routes } from 'discord.js';
import { config } from './config.js';
import { commandData } from './commands/index.js';

const rest = new REST({ version: '10' }).setToken(config.discord.token);

async function main() {
  const { clientId, devGuildId } = config.discord;
  try {
    if (devGuildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, devGuildId), {
        body: commandData,
      });
      console.log(
        `✔ Registered ${commandData.length} command(s) to dev guild ${devGuildId}.`,
      );
    } else {
      await rest.put(Routes.applicationCommands(clientId), { body: commandData });
      console.log(
        `✔ Registered ${commandData.length} global command(s). ` +
          `Global commands can take up to an hour to appear the first time.`,
      );
    }
  } catch (err) {
    console.error('✖ Failed to register commands:', err);
    process.exit(1);
  }
}

main();
