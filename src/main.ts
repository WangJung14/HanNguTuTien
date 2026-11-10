import { Client } from 'discord.js';
import { getDatabaseProvider, getDictationTtsConfig, getDiscordConfig } from './config/env.js';
import { buildBot } from './app/bot.js';
import { openDictionary } from './shared/database/open-dictionary.js';
import { openProgress } from './shared/database/open-progress.js';
import { DictionaryService, SqliteDictionaryRepository } from './modules/dictionary/index.js';
import { BagService, PostgresBagRepository, SqliteBagRepository } from './modules/bag/index.js';
import { DeckService, PostgresDeckRepository, SqliteDeckRepository } from './modules/decks/index.js';
import { createAudioProvider, DictationService, PostgresDictationRepository, SqliteDictationRepository } from './modules/dictation/index.js';
import {
  BreakthroughService, DiscordRoleSync, PostgresCultivationRepository, RealmService, SqliteCultivationRepository, XpService,
  type XpAwardEvent,
} from './modules/cultivation/index.js';
import { PostgresQuestService, QuestService } from './modules/quests/index.js';
import { attachMeditationRunner,MeditationService,PostgresMeditationService } from './modules/meditation/index.js';
import{MountainMatchService,MountainQuestionService,MountainScheduler,PostgresMountainRepository,SqliteMountainRepository}from'./modules/mountain/index.js';
import{PostgresPveRepository,PveScheduler,PveService,QuestionPackService,SqlitePveRepository}from'./modules/pve/index.js';
import { openPostgres } from './scripts/postgres-common.js';
import { closeHealthServer, startHealthServer } from './shared/http/health-server.js';

const config = getDiscordConfig();
const databaseProvider = getDatabaseProvider();
const postgresConnection = databaseProvider === 'postgres' ? openPostgres('runtime') : null;
const dictionaryConnection = openDictionary();
const dictionaryRepository = new SqliteDictionaryRepository(dictionaryConnection.db, dictionaryConnection.sqlite);
const dictionaryService = new DictionaryService(dictionaryRepository);
const progressConnection = databaseProvider === 'sqlite' ? openProgress() : null;
const bagRepository = postgresConnection
  ? new PostgresBagRepository(postgresConnection)
  : new SqliteBagRepository(progressConnection!.db);
const bagService = new BagService(bagRepository, dictionaryService);
const deckRepository = postgresConnection
  ? new PostgresDeckRepository(postgresConnection)
  : new SqliteDeckRepository(progressConnection!.sqlite);
const deckService = new DeckService(deckRepository, dictionaryService);
const dictationRepository = postgresConnection
  ? new PostgresDictationRepository(postgresConnection)
  : new SqliteDictationRepository(progressConnection!.sqlite);
const audioProvider = createAudioProvider(getDictationTtsConfig());
const dictationService = new DictationService(dictationRepository, deckService, dictionaryService, audioProvider);
const cultivationRepository = postgresConnection
  ? new PostgresCultivationRepository(postgresConnection)
  : new SqliteCultivationRepository(progressConnection!.sqlite);
const realmService = new RealmService(cultivationRepository);
let discordClient: Client | null = null;
const xpService = new XpService(cultivationRepository, async (event: XpAwardEvent) => {
  const channelId = await cultivationRepository.getXpAnnouncementChannel(event.guildId);
  if (!channelId) return;
  if (!discordClient?.isReady()) throw new Error('Discord client is not ready to send XP announcements.');
  const channel = await discordClient.channels.fetch(channelId);
  if (!channel || !channel.isTextBased() || !('send' in channel) || typeof channel.send !== 'function') {
    throw new Error(`XP announcement channel ${channelId} is unavailable or cannot accept messages.`);
  }
  const sourceNames: Record<string, string> = {
    dictation_correct: 'trả lời khảo bài đúng',
    dictation_complete: 'hoàn thành khảo bài',
    dictation_perfect_10: 'hoàn thành khảo bài hoàn hảo',
    meditation_tick: 'bế quan',
    quest_collect_words: 'nhiệm vụ sưu tầm từ',
    quest_correct_dictation: 'nhiệm vụ trả lời đúng',
    quest_complete_session: 'nhiệm vụ hoàn thành phiên học',
    quest_meditate_minutes: 'nhiệm vụ bế quan',
    mountain_complete: 'hoàn thành Vấn Đỉnh',
    secret_realm_clear: 'vượt Bí Cảnh',
    boss_hsk_win: 'đánh bại Boss HSK',
  };
  const reason = sourceNames[event.source] ?? event.source.replaceAll('_', ' ');
  await channel.send({
    content: `🎉 <@${event.userId}> nhận **+${event.amount} XP** nhờ ${reason}. Tổng tu vi: **${event.totalXp.toLocaleString('vi-VN')} XP**.`,
    allowedMentions: { parse: [] },
  });
});
const breakthroughService = new BreakthroughService(cultivationRepository, realmService, dictationService);
const roleSync = new DiscordRoleSync(cultivationRepository);
const questService = postgresConnection
  ? new PostgresQuestService(postgresConnection, xpService)
  : new QuestService(progressConnection!.sqlite, xpService);
const meditationService = postgresConnection
  ? new PostgresMeditationService(postgresConnection, xpService, questService)
  : new MeditationService(progressConnection!.sqlite, xpService, questService);
const mountainRepository = postgresConnection
  ? new PostgresMountainRepository(postgresConnection)
  : new SqliteMountainRepository(progressConnection!.sqlite);
const mountainQuestionService=new MountainQuestionService(deckService);
const mountainService=new MountainMatchService(mountainRepository,mountainQuestionService,xpService);
const mountainScheduler=new MountainScheduler(mountainService);
const pveRepository = postgresConnection
  ? new PostgresPveRepository(postgresConnection)
  : new SqlitePveRepository(progressConnection!.sqlite);
const questionPacks=new QuestionPackService();
const pveService=new PveService(pveRepository,questionPacks,xpService);
const pveScheduler=new PveScheduler(pveService);
const learningRewards={
  awardQuestion:async(guildId:string,userId:string,question:Parameters<XpService['awardQuestion']>[2])=>{
    const award=await xpService.awardQuestion(guildId,userId,question);if(question.isCorrect)await questService.recordCorrectAnswer(guildId,userId);return award;
  },
  awardCompletion:async(guildId:string,userId:string,sessionId:string,questionCount:number,correctCount:number,allFirstTry:boolean)=>{
    const awards=await xpService.awardCompletion(guildId,userId,sessionId,questionCount,correctCount,allFirstTry);
    await questService.recordCompletedSession(guildId,userId,sessionId,questionCount);return awards;
  },
};
const client = buildBot(dictionaryService, bagService, deckService, dictationService, {
  repository: cultivationRepository, realms: realmService, xp: xpService, breakthrough: breakthroughService, roleSync,
},{quests:questService,meditation:meditationService,rewards:learningRewards},{service:mountainService,scheduler:mountainScheduler},{service:pveService,scheduler:pveScheduler});
discordClient = client;
const stopMeditation=attachMeditationRunner(client,meditationService);
const healthServer=startHealthServer(client);
mountainScheduler.start(client);
pveScheduler.start(client);

async function shutdown() {
  stopMeditation();
  mountainScheduler.stop();
  pveScheduler.stop();
  await closeHealthServer(healthServer);
  client.destroy();
  progressConnection?.close();
  dictionaryConnection.close();
  await postgresConnection?.end({ timeout: 5 });
}
process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });

client.login(config.token).catch(async (error: unknown) => {
  console.error('Discord login failed:', error);
  await shutdown();
  process.exitCode = 1;
});
