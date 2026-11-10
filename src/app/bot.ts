import { Client, Events, GatewayIntentBits, MessageFlags } from 'discord.js';
import { handleTudien, type DictionaryService } from '../modules/dictionary/index.js';
import { createSaveButtons, handleBagButton, handleTuikho, type BagService } from '../modules/bag/index.js';
import { createDeckButtons, handleBotu, handleDeckButton, handleDeckSelect, DeckError, type DeckService } from '../modules/decks/index.js';
import {
  DictationAudioError, DictationError, handleDictationButton, handleDictationModal,
  handleDictationSelect, handleKhaobai, type DictationService,
} from '../modules/dictation/index.js';
import {
  CultivationError, handleCultivationButton, handleCultivationModal, handleDotpha, handleLichsu,
  handleRealmRole, handleTuvi, type BreakthroughService, type DiscordRoleSync, type RealmService,
  type SqliteCultivationRepository, type XpService,
} from '../modules/cultivation/index.js';
import { handleBequan,handleBequanConfig,handleDiemdanh,handleNhiemvu,type QuestService } from '../modules/quests/index.js';
import type { MeditationService } from '../modules/meditation/index.js';
import{handleLeonui,handleMountainButton,MountainError,type MountainMatchService,type MountainScheduler}from'../modules/mountain/index.js';
import{handleBicanh,handleBoss,handlePveButton,PveError,type PveScheduler,type PveService}from'../modules/pve/index.js';

type CultivationDependencies = { repository: SqliteCultivationRepository; realms: RealmService; xp: XpService;
  breakthrough: BreakthroughService; roleSync: DiscordRoleSync };
type Phase41Dependencies={quests:QuestService;meditation:MeditationService;rewards:{
  awardQuestion(...args:Parameters<XpService['awardQuestion']>):ReturnType<XpService['awardQuestion']>;
  awardCompletion(...args:Parameters<XpService['awardCompletion']>):ReturnType<XpService['awardCompletion']>;
}};
type MountainDependencies={service:MountainMatchService;scheduler:MountainScheduler};
type PveDependencies={service:PveService;scheduler:PveScheduler};

export function buildBot(
  dictionaryService: DictionaryService,
  bagService: BagService,
  deckService: DeckService,
  dictationService: DictationService,
  cultivation: CultivationDependencies,
  phase41:Phase41Dependencies,
  mountain:MountainDependencies,
  pve:PveDependencies,
) {
  const client = new Client({ intents: [GatewayIntentBits.Guilds,GatewayIntentBits.GuildVoiceStates] });

  client.once(Events.ClientReady, (readyClient) => {
    console.log(`✅ Bot online: ${readyClient.user.tag}`);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isButton() && interaction.customId.startsWith('bag:')) {
        await handleBagButton(interaction, bagService,phase41.quests);
        return;
      }
      if (interaction.isButton() && interaction.customId.startsWith('deck:')) {
        await handleDeckButton(interaction, deckService);
        return;
      }
      if (interaction.isButton() && interaction.customId.startsWith('dictation:')) {
        await handleDictationButton(interaction, dictationService, phase41.rewards);
        return;
      }
      if (interaction.isButton() && interaction.customId.startsWith('cultivation:')) {
        await handleCultivationButton(interaction, cultivation.breakthrough, cultivation.roleSync);
        return;
      }
      if(interaction.isButton()&&interaction.customId.startsWith('mountain:')){await handleMountainButton(interaction,mountain.service,mountain.scheduler);return;}
      if(interaction.isButton()&&interaction.customId.startsWith('pve:')){await handlePveButton(interaction,pve.service,pve.scheduler);return;}
      if (interaction.isStringSelectMenu() && interaction.customId.startsWith('deck:')) {
        await handleDeckSelect(interaction, deckService);
        return;
      }
      if (interaction.isStringSelectMenu() && interaction.customId.startsWith('dictation:')) {
        await handleDictationSelect(interaction, dictationService);
        return;
      }
      if (interaction.isModalSubmit() && interaction.customId.startsWith('dictation:')) {
        await handleDictationModal(interaction, dictationService, phase41.rewards);
        return;
      }
      if (interaction.isModalSubmit() && interaction.customId.startsWith('cultivation:')) {
        await handleCultivationModal(interaction, cultivation.breakthrough);
        return;
      }
      if (!interaction.isChatInputCommand()) return;

      switch (interaction.commandName) {
        case 'ping':
          await interaction.reply({ content: '🏓 Sư phụ vẫn đang tu luyện!', flags: MessageFlags.Ephemeral });
          break;
        case 'help':
          await interaction.reply({
            content: '📜 Lệnh: `/tudien`, `/tuikho`, `/botu`, `/khaobai`, `/tuvi`, `/dotpha`, `/nhiemvu`, `/bequan`, `/diemdanh`, `/leonui`, `/bicanh`, `/boss`. Admin: `/canhgioirole`, `/bequancauhinh`.',
            flags: MessageFlags.Ephemeral,
          });
          break;
        case 'tudien':
          await handleTudien(interaction, dictionaryService, (entries, ownerId) => [
            ...createSaveButtons(entries, ownerId),
            ...createDeckButtons(entries, ownerId),
          ]);
          break;
        case 'tuikho':
          await handleTuikho(interaction, bagService);
          break;
        case 'botu':
          await handleBotu(interaction, deckService);
          break;
        case 'khaobai':
          await handleKhaobai(interaction, dictationService);
          break;
        case 'tuvi': await handleTuvi(interaction, cultivation.realms); break;
        case 'dotpha': await handleDotpha(interaction, cultivation.breakthrough); break;
        case 'lichsutuvi': await handleLichsu(interaction, cultivation.xp, cultivation.breakthrough); break;
        case 'canhgioirole': await handleRealmRole(interaction, cultivation.repository, cultivation.realms, cultivation.roleSync); break;
        case 'nhiemvu':await handleNhiemvu(interaction,phase41.quests);break;
        case 'bequan':await handleBequan(interaction,phase41.meditation);break;
        case 'diemdanh':await handleDiemdanh(interaction,phase41.quests);break;
        case 'bequancauhinh':await handleBequanConfig(interaction,phase41.meditation);break;
        case 'leonui':await handleLeonui(interaction,mountain.service,mountain.scheduler);break;
        case 'bicanh':await handleBicanh(interaction,pve.service,pve.scheduler);break;
        case 'boss':await handleBoss(interaction,pve.service);break;
      }
    } catch (error) {
      console.error('Discord interaction failed:', error);
      if (!interaction.isRepliable()) return;
      const message = error instanceof DeckError || error instanceof DictationError || error instanceof DictationAudioError || error instanceof CultivationError || error instanceof MountainError || error instanceof PveError
        ? `⚠️ ${error.message}` : 'Sư phụ gặp lỗi khi xử lý. Hãy thử lại sau.';
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ content: message, embeds: [], components: [] });
        } else {
          await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
        }
      } catch (replyError) {
        console.error('Could not respond to interaction:', replyError);
      }
    }
  });

  return client;
}
