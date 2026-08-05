// Register slash commands with Discord. Run this once after editing commands:
//
//   npm run deploy
//
// With DISCORD_DEV_GUILD_ID set, commands register to that guild instantly
// (handy while developing). Without it, they register globally — which is what
// you want in production, but can take up to ~1h to propagate the first time.
//
// Container deploys can skip this and set AUTO_DEPLOY_COMMANDS=true instead, so
// the bot registers on startup.
import { registerCommands } from './register.js';

registerCommands()
  .then(({ scope, count }) => {
    console.log(
      `✔ Registered ${count} command(s) to ${scope}.` +
        (scope === 'global'
          ? ' Global commands can take up to an hour to appear the first time.'
          : ''),
    );
  })
  .catch((err) => {
    console.error('✖ Failed to register commands:', err);
    process.exit(1);
  });
