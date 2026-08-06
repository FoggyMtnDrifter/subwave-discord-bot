// Shared slash-command registration. Used by the `npm run deploy` CLI and, when
// AUTO_DEPLOY_COMMANDS is enabled, by the bot itself on startup (handy for
// container deploys where there's no separate deploy step).
//
// If the station has requests disabled, /request is left out of the registered
// set entirely, so it never shows up as a dead command.
import { REST, Routes } from 'discord.js';
import { config } from './config.js';
import { commandData } from './commands/index.js';
import { requestsEnabled } from './subwave.js';

/**
 * Register all applicable slash commands with Discord.
 * With DISCORD_DEV_GUILD_ID set, registers to that guild (instant). Otherwise
 * registers globally (can take up to ~1h to propagate the first time).
 * @returns { scope, count, requestsEnabled }
 */
export async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(config.discord.token);
  const { clientId, devGuildId } = config.discord;

  const enabled = await requestsEnabled();
  const body = commandData.filter((c) => enabled || c.name !== 'request');

  if (devGuildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, devGuildId), { body });
    return { scope: `guild ${devGuildId}`, count: body.length, requestsEnabled: enabled };
  }

  await rest.put(Routes.applicationCommands(clientId), { body });
  return { scope: 'global', count: body.length, requestsEnabled: enabled };
}
