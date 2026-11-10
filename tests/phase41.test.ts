import Database from 'better-sqlite3';
import {describe,expect,it} from 'vitest';
import {applyProgressMigrations} from '../src/modules/bag/infrastructure/migrations.js';
import {applyDeckMigrations} from '../src/modules/decks/infrastructure/migrations.js';
import {applyDictationMigrations} from '../src/modules/dictation/infrastructure/migrations.js';
import {applyCultivationMigrations} from '../src/modules/cultivation/infrastructure/migrations.js';
import {applyPhase41Migrations} from '../src/modules/quests/infrastructure/migrations.js';
import {SqliteCultivationRepository} from '../src/modules/cultivation/infrastructure/sqlite-cultivation.repository.js';
import {XpService} from '../src/modules/cultivation/application/xp.service.js';
import {QuestService} from '../src/modules/quests/index.js';
import {MeditationService} from '../src/modules/meditation/index.js';

function setup(){const sqlite=new Database(':memory:');sqlite.pragma('foreign_keys=ON');applyProgressMigrations(sqlite);applyDeckMigrations(sqlite);applyDictationMigrations(sqlite);applyCultivationMigrations(sqlite);applyPhase41Migrations(sqlite);const repo=new SqliteCultivationRepository(sqlite);const xp=new XpService(repo);const quests=new QuestService(sqlite,xp);return{sqlite,repo,xp,quests,meditation:new MeditationService(sqlite,xp,quests)};}
const at=(minute:number)=>new Date(`2026-11-10T00:${String(minute).padStart(2,'0')}:00.000Z`);

describe('Meditation',()=>{
  it('awards 5 XP at five minutes but nothing when leaving early',()=>{const{sqlite,repo,meditation}=setup();meditation.setChannel('g','vc',at(0));meditation.start('g','u','vc',at(0));expect(meditation.processDue(new Date('2026-11-10T00:04:59Z'))).toBe(0);meditation.end('g','u',new Date('2026-11-10T00:04:59Z'));expect(meditation.processDue(at(5))).toBe(0);meditation.start('g','u','vc',at(5));expect(meditation.processDue(at(10))).toBe(1);expect(repo.getOrCreateProfile('g','u',at(10).toISOString()).totalXp).toBe(5);sqlite.close();});
  it('is idempotent, handles multiple users, and discards partial time on restart',()=>{const{sqlite,repo,meditation}=setup();meditation.setChannel('g','vc',at(0));meditation.start('g','u1','vc',at(0));meditation.start('g','u2','vc',at(0));expect(meditation.processDue(at(5))).toBe(2);expect(meditation.processDue(at(5))).toBe(0);meditation.endAll(at(7));meditation.start('g','u1','vc',at(7));expect(meditation.processDue(at(10))).toBe(0);expect(repo.getOrCreateProfile('g','u1',at(10).toISOString()).totalXp).toBe(5);expect(repo.getOrCreateProfile('g','u2',at(10).toISOString()).totalXp).toBe(5);sqlite.close();});
  it('shares the 60 XP source cap with its quest and never crosses 1750 total XP',()=>{const{sqlite,repo,meditation}=setup();repo.addXp('g','u',1748,'seed','seed',null,'2026-11-09',at(0).toISOString(),9999);meditation.setChannel('g','vc',at(0));meditation.start('g','u','vc',at(0));meditation.processDue(at(5));expect(repo.getOrCreateProfile('g','u',at(5).toISOString()).totalXp).toBe(1750);
    const other=setup();other.meditation.setChannel('g','vc',at(0));other.meditation.start('g','u','vc',at(0));other.meditation.processDue(new Date('2026-11-10T01:00:00Z'));expect(other.meditation.status('g','u',new Date('2026-11-10T01:00:00Z')).xp).toBe(60);expect(other.repo.getOrCreateProfile('g','u',at(0).toISOString()).totalXp).toBe(60);other.sqlite.close();sqlite.close();});
  it('still respects the global 200 XP cap',()=>{const{sqlite,repo,xp,meditation}=setup();xp.awardExternal('g','u',198,'other','other',{now:at(0)});meditation.setChannel('g','vc',at(0));meditation.start('g','u','vc',at(0));meditation.processDue(at(5));expect(repo.getOrCreateProfile('g','u',at(5).toISOString()).totalXp).toBe(200);sqlite.close();});
});

describe('Daily quests and streak',()=>{
  it('counts unique saved entries and rewards each quest only once per Vietnam day',()=>{const{sqlite,repo,quests}=setup();for(let id=1;id<=5;id++){quests.recordSavedWord('g','u',id,at(0));quests.recordSavedWord('g','u',id,at(0));}const row=quests.getDaily('g','u',at(0)).find(x=>x.questKey==='collect_words')!;expect(row).toMatchObject({progress:5,xpAwarded:10});expect(repo.getOrCreateProfile('g','u',at(0).toISOString()).totalXp).toBe(10);quests.getDaily('g','u',at(0));expect(repo.getOrCreateProfile('g','u',at(0).toISOString()).totalXp).toBe(10);sqlite.close();});
  it('resets quests by Vietnam date and resets a missed-day streak on next study',()=>{const{sqlite,quests}=setup();const d1=new Date('2026-11-10T16:59:00Z');const d2=new Date('2026-11-10T17:01:00Z');quests.recordCorrectAnswer('g','u',d1);expect(quests.getDaily('g','u',d1).find(x=>x.questKey==='correct_dictation')!.progress).toBe(1);expect(quests.getDaily('g','u',d2).find(x=>x.questKey==='correct_dictation')!.progress).toBe(0);
    quests.recordCompletedSession('g','u','s1',10,new Date('2026-11-09T10:00:00Z'));quests.recordCompletedSession('g','u','s2',10,new Date('2026-11-10T10:00:00Z'));expect(quests.getStreak('g','u').currentStreak).toBe(2);quests.recordCompletedSession('g','u','s3',10,new Date('2026-11-12T10:00:00Z'));expect(quests.getStreak('g','u')).toMatchObject({currentStreak:1,longestStreak:2});sqlite.close();});
  it('migrates v5 data without loss',()=>{const sqlite=new Database(':memory:');applyProgressMigrations(sqlite);applyDeckMigrations(sqlite);applyDictationMigrations(sqlite);applyCultivationMigrations(sqlite);sqlite.prepare(`INSERT INTO cultivation_profiles(guild_id,user_id,total_xp,major_index,role_sync_pending,created_at,updated_at) VALUES('g','u',123,0,0,'x','x')`).run();applyPhase41Migrations(sqlite);expect(sqlite.pragma('user_version',{simple:true})).toBe(6);expect(sqlite.prepare(`SELECT total_xp AS xp FROM cultivation_profiles WHERE guild_id='g'`).get()).toEqual({xp:123});sqlite.close();});
});
