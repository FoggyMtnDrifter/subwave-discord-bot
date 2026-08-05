// Shared slash-command registration. Used by the `npm run deploy` CLI and, when
// AUTO_DEPLOY_COMMANDS is enabled, by the bot itself on startup (handy for
// container deploys where there's no separate deploy step).
import { REST, Routes } from 'discord.js';
import { config } from './config.js';
import { commandData } from './commands/index.js';

/**
 * Register all slash commands with Discord.
 * With DISCORD_DEV_GUILD_ID set, registers to that guild (instant). Otherwise
 * registers globally (can take up to ~1h to propagate the first time).
 * @returns { scope, count }
 */
export async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(config.discord.token);
  const { clientId, devGuildId } = config.discord;

  if (devGuildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, devGuildId), {
      body: commandData,
    });
    return { scope: `guild ${devGuildId}`, count: commandData.length };
  }

  await rest.put(Routes.applicationCommands(clientId), { body: commandData });
  return { scope: 'global', count: commandData.length };
}
