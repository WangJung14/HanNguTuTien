import { getDictationTtsConfig, getDiscordConfig } from './config/env.js';
import { buildBot } from './app/bot.js';
import { openDictionary } from './shared/database/open-dictionary.js';
import { openProgress } from './shared/database/open-progress.js';
import { DictionaryService, SqliteDictionaryRepository } from './modules/dictionary/index.js';
import { BagService, SqliteBagRepository } from './modules/bag/index.js';
import { DeckService, SqliteDeckRepository } from './modules/decks/index.js';
import { createAudioProvider, DictationService, SqliteDictationRepository } from './modules/dictation/index.js';
import {
  BreakthroughService, DiscordRoleSync, RealmService, SqliteCultivationRepository, XpService,
} from './modules/cultivation/index.js';
import { QuestService } from './modules/quests/index.js';
import { attachMeditationRunner,MeditationService } from './modules/meditation/index.js';
import{MountainMatchService,MountainQuestionService,MountainScheduler,SqliteMountainRepository}from'./modules/mountain/index.js';
import{PveScheduler,PveService,QuestionPackService,SqlitePveRepository}from'./modules/pve/index.js';
import { closeHealthServer, startHealthServer } from './shared/http/health-server.js';

if ((process.env.DATABASE_PROVIDER || 'sqlite').toLowerCase() === 'postgres') {
  throw new Error('PostgreSQL runtime repositories are not enabled yet. Refusing to fall back to ephemeral SQLite in production.');
}

const config = getDiscordConfig();
const dictionaryConnection = openDictionary();
const progressConnection = openProgress();
const dictionaryRepository = new SqliteDictionaryRepository(dictionaryConnection.db, dictionaryConnection.sqlite);
const dictionaryService = new DictionaryService(dictionaryRepository);
const bagRepository = new SqliteBagRepository(progressConnection.db);
const bagService = new BagService(bagRepository, dictionaryService);
const deckRepository = new SqliteDeckRepository(progressConnection.sqlite);
const deckService = new DeckService(deckRepository, dictionaryService);
const dictationRepository = new SqliteDictationRepository(progressConnection.sqlite);
const audioProvider = createAudioProvider(getDictationTtsConfig());
const dictationService = new DictationService(dictationRepository, deckService, dictionaryService, audioProvider);
const cultivationRepository = new SqliteCultivationRepository(progressConnection.sqlite);
const realmService = new RealmService(cultivationRepository);
const xpService = new XpService(cultivationRepository);
const breakthroughService = new BreakthroughService(cultivationRepository, realmService, dictationService);
const roleSync = new DiscordRoleSync(cultivationRepository);
const questService=new QuestService(progressConnection.sqlite,xpService);
const meditationService=new MeditationService(progressConnection.sqlite,xpService,questService);
const mountainRepository=new SqliteMountainRepository(progressConnection.sqlite);
const mountainQuestionService=new MountainQuestionService(deckService);
const mountainService=new MountainMatchService(mountainRepository,mountainQuestionService,xpService);
const mountainScheduler=new MountainScheduler(mountainService);
const pveRepository=new SqlitePveRepository(progressConnection.sqlite);
const questionPacks=new QuestionPackService();
const pveService=new PveService(pveRepository,questionPacks,xpService);
const pveScheduler=new PveScheduler(pveService);
const learningRewards={
  awardQuestion:(guildId:string,userId:string,question:Parameters<XpService['awardQuestion']>[2])=>{
    const award=xpService.awardQuestion(guildId,userId,question);if(question.isCorrect)questService.recordCorrectAnswer(guildId,userId);return award;
  },
  awardCompletion:(guildId:string,userId:string,sessionId:string,questionCount:number,correctCount:number,allFirstTry:boolean)=>{
    const awards=xpService.awardCompletion(guildId,userId,sessionId,questionCount,correctCount,allFirstTry);
    questService.recordCompletedSession(guildId,userId,sessionId,questionCount);return awards;
  },
};
const client = buildBot(dictionaryService, bagService, deckService, dictationService, {
  repository: cultivationRepository, realms: realmService, xp: xpService, breakthrough: breakthroughService, roleSync,
},{quests:questService,meditation:meditationService,rewards:learningRewards},{service:mountainService,scheduler:mountainScheduler},{service:pveService,scheduler:pveScheduler});
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
  progressConnection.close();
  dictionaryConnection.close();
}
process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });

client.login(config.token).catch(async (error: unknown) => {
  console.error('Discord login failed:', error);
  await shutdown();
  process.exitCode = 1;
});
