import { SlashCommandBuilder } from 'discord.js';
import { menuDefinition } from './menu.js';
import { tudienDefinition } from '../modules/dictionary/index.js';
import { tuikhoDefinition } from '../modules/bag/index.js';
import { botuDefinition } from '../modules/decks/index.js';
import { khaobaiDefinition } from '../modules/dictation/index.js';
import { canhgioiroleDefinition, dotphaDefinition, lichsutuviDefinition, tuviDefinition, xpAdminDefinition, xpkenhDefinition } from '../modules/cultivation/index.js';
import { bequanDefinition,bequancauhinhDefinition,diemdanhDefinition,nhiemvuDefinition } from '../modules/quests/index.js';
import {leonuiDefinition} from '../modules/mountain/index.js';
import{bicanhDefinition,bossDefinition}from'../modules/pve/index.js';
import{bangxeptuviDefinition,tongmonDefinition}from'../modules/sects/index.js';

export const pingDefinition = new SlashCommandBuilder()
  .setName('ping').setDescription('Kiểm tra bot còn hoạt động hay không');
export const helpDefinition = new SlashCommandBuilder()
  .setName('help').setDescription('Xem các lệnh đã triển khai');

export const commandDefinitions = [
  pingDefinition, helpDefinition, menuDefinition, tudienDefinition, tuikhoDefinition, botuDefinition, khaobaiDefinition,
  tuviDefinition, xpkenhDefinition, xpAdminDefinition, dotphaDefinition, lichsutuviDefinition, canhgioiroleDefinition,
  nhiemvuDefinition,bequanDefinition,diemdanhDefinition,bequancauhinhDefinition,
  leonuiDefinition,
  bicanhDefinition,bossDefinition,
  tongmonDefinition,bangxeptuviDefinition,
];
