import { REST, Routes } from 'discord.js';
import { getDiscordConfig } from '../config/env.js';
import { commandDefinitions } from '../app/command-registry.js';

const { token, clientId, guildId } = getDiscordConfig();
const rest = new REST({ version: '10' }).setToken(token);
await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
  body: commandDefinitions.map((cmd) => cmd.toJSON()),
});
console.log(`✅ Registered ${commandDefinitions.length} guild commands for guild ${guildId}`);
