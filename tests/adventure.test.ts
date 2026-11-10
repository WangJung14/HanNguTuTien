import Database from 'better-sqlite3';
import { describe,expect,it } from 'vitest';
import { applyProgressMigrations } from '../src/modules/bag/infrastructure/migrations.js';
import { applyDeckMigrations } from '../src/modules/decks/infrastructure/migrations.js';
import { applyDictationMigrations } from '../src/modules/dictation/infrastructure/migrations.js';
import { applyCultivationMigrations } from '../src/modules/cultivation/infrastructure/migrations.js';
import { applyPhase41Migrations } from '../src/modules/quests/infrastructure/migrations.js';
import { applyMountainMigrations } from '../src/modules/mountain/infrastructure/migrations.js';
import { applyPveMigrations } from '../src/modules/pve/infrastructure/migrations.js';
import { applySectMigrations } from '../src/modules/sects/infrastructure/migrations.js';
import { applyAdventureMigrations } from '../src/modules/adventure/infrastructure/migrations.js';
import { SqliteCultivationRepository } from '../src/modules/cultivation/infrastructure/sqlite-cultivation.repository.js';
import { XpService } from '../src/modules/cultivation/application/xp.service.js';
import { AdventureContentService } from '../src/modules/adventure/application/content-pack.service.js';
import { AdventureService } from '../src/modules/adventure/application/adventure.service.js';
import { SqliteAdventureRepository } from '../src/modules/adventure/infrastructure/sqlite-adventure.repository.js';

function migrate(db:Database.Database){applyProgressMigrations(db);applyDeckMigrations(db);applyDictationMigrations(db);applyCultivationMigrations(db);applyPhase41Migrations(db);applyMountainMigrations(db);applyPveMigrations(db);applySectMigrations(db);applyAdventureMigrations(db);}
function setup(){const db=new Database(':memory:');db.pragma('foreign_keys=ON');migrate(db);const repo=new SqliteAdventureRepository(db);const cultivation=new SqliteCultivationRepository(db);const content=new AdventureContentService();return{db,repo,cultivation,content,service:new AdventureService(repo,content,new XpService(cultivation))};}
async function answerCorrect(x:ReturnType<typeof setup>,event:string){const state=await x.service.state('g','u');const option=state.scene.options.find(o=>o.correct)!;return x.service.choose({eventKey:event,guildId:'g',userId:'u',chapterIndex:state.progress.chapterIndex,sceneIndex:state.progress.sceneIndex,version:state.progress.version,optionId:option.id});}

describe('Phase 7 adventure',()=>{
 it('loads a reviewed pack with exactly 3 chapters and 5 scenes each',()=>{const x=setup();expect(x.content.pack.chapters).toHaveLength(3);expect(x.content.pack.chapters.every(c=>c.scenes.length===5)).toBe(true);x.db.close();});
 it('explains a wrong answer without advancing or removing XP',async()=>{const x=setup();const state=await x.service.state('g','u');const wrong=state.scene.options.find(o=>!o.correct)!;const result=await x.service.choose({eventKey:'wrong',guildId:'g',userId:'u',chapterIndex:0,sceneIndex:0,version:0,optionId:wrong.id});expect(result).toMatchObject({correct:false,chapterCompleted:false});expect(result.progress.sceneIndex).toBe(0);expect((await x.cultivation.getOrCreateProfile('g','u',new Date().toISOString())).totalXp).toBe(0);x.db.close();});
 it('checkpoints every scene and awards a chapter exactly once under retries',async()=>{const x=setup();for(let n=0;n<4;n++)await answerCorrect(x,`a:${n}`);const before=await x.service.state('g','u');const option=before.scene.options.find(o=>o.correct)!;const input={eventKey:'last',guildId:'g',userId:'u',chapterIndex:0,sceneIndex:4,version:before.progress.version,optionId:option.id};const first=await x.service.choose(input);expect(first.chapterCompleted).toBe(true);expect((await x.service.choose(input)).duplicate).toBe(true);expect((await x.cultivation.getOrCreateProfile('g','u',new Date().toISOString())).totalXp).toBe(20);expect(await x.repo.completions('g','u')).toMatchObject([{chapterIndex:0,xpAwarded:20,rewardClaimed:true}]);x.db.close();});
 it('reconciles a completion reward after a simulated restart',async()=>{const x=setup();for(let n=0;n<4;n++)await answerCorrect(x,`pre:${n}`);const p=await x.repo.getOrCreate('g','u',new Date().toISOString());const scene=x.content.scene(0,4),option=scene.options.find(o=>o.correct)!;await x.repo.choose({eventKey:'crash-window',guildId:'g',userId:'u',chapterIndex:0,sceneIndex:4,version:p.version,optionId:option.id,correct:true,feedback:option.feedback,lastScene:true,lastChapter:false,now:new Date().toISOString()});expect((await x.cultivation.getOrCreateProfile('g','u',new Date().toISOString())).totalXp).toBe(0);const restarted=new AdventureService(x.repo,x.content,new XpService(x.cultivation));await restarted.state('g','u');await restarted.state('g','u');expect((await x.cultivation.getOrCreateProfile('g','u',new Date().toISOString())).totalXp).toBe(20);x.db.close();});
 it('unlocks all three chapters in order and keeps rewards idempotent on replay',async()=>{const x=setup();await expect(x.service.startChapter('g','u',2)).rejects.toThrow(/chưa được mở khóa/u);for(let n=0;n<15;n++)await answerCorrect(x,`full:${n}`);const state=await x.service.state('g','u');expect(state.progress.status).toBe('COMPLETED');expect(state.completions).toHaveLength(3);expect((await x.cultivation.getOrCreateProfile('g','u',new Date().toISOString())).totalXp).toBe(60);await x.service.startChapter('g','u',1);for(let n=0;n<5;n++)await answerCorrect(x,`replay:${n}`);expect((await x.cultivation.getOrCreateProfile('g','u',new Date().toISOString())).totalXp).toBe(60);x.db.close();});
 it('is restart-safe at SQLite schema v10',()=>{const x=setup();migrate(x.db);expect(x.db.pragma('user_version',{simple:true})).toBe(10);x.db.close();});
});
