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
import { SqliteCultivationRepository } from '../src/modules/cultivation/infrastructure/sqlite-cultivation.repository.js';
import { RealmService } from '../src/modules/cultivation/application/realm.service.js';
import { SectContributionService,SectService } from '../src/modules/sects/application/sect.service.js';
import { SqliteSectRepository } from '../src/modules/sects/infrastructure/sqlite-sect.repository.js';

function setup(){const db=new Database(':memory:');db.pragma('foreign_keys=ON');applyProgressMigrations(db);applyDeckMigrations(db);applyDictationMigrations(db);applyCultivationMigrations(db);applyPhase41Migrations(db);applyMountainMigrations(db);applyPveMigrations(db);applySectMigrations(db);const cultivation=new SqliteCultivationRepository(db);const repo=new SqliteSectRepository(db);return{db,cultivation,repo,service:new SectService(repo,new RealmService(cultivation)),cp:new SectContributionService(repo)};}
async function xp(c:SqliteCultivationRepository,user:string,amount=100){await c.addXp('g',user,amount,'test',`xp:${user}`,null,'2026-11-11','2026-11-11T00:00:00.000Z',999999);}

describe('Phase 6 sects',()=>{
 it('keeps the SQLite migration restart-safe at schema v9',()=>{const x=setup();applyProgressMigrations(x.db);applyDeckMigrations(x.db);applyDictationMigrations(x.db);applyCultivationMigrations(x.db);applyPhase41Migrations(x.db);applyMountainMigrations(x.db);applyPveMigrations(x.db);applySectMigrations(x.db);expect(x.db.pragma('user_version',{simple:true})).toBe(9);x.db.close();});
 it('requires Luyện Khí, keeps one membership, and enforces officer flow',async()=>{const x=setup();await expect(x.service.create('g','u','Thanh Vân')).rejects.toThrow();await xp(x.cultivation,'u');await xp(x.cultivation,'v');const sect=await x.service.create('g','u','Thanh Vân');await x.service.request('g','v',sect.id);const [request]=await x.service.requests('g','u');expect(request?.userId).toBe('v');await x.service.resolve('g','u',request!.id,true);expect((await x.service.profile('g','v'))?.member.role).toBe('DISCIPLE');await expect(x.service.create('g','v','Khác')).rejects.toThrow();x.db.close();});
 it('makes concurrent CP claims idempotent, caps them daily, and preserves their original sect',async()=>{const x=setup();await xp(x.cultivation,'u');const sect=await x.service.create('g','u','Thanh Vân');const now=new Date('2026-11-11T00:00:00Z');const competing=await Promise.all([x.cp.award('g','u',80,'test','same',now),x.cp.award('g','u',80,'test','same',now)]);expect(competing.reduce((sum,a)=>sum+a.awarded,0)).toBe(80);expect(competing.filter(a=>a.duplicate)).toHaveLength(1);expect((await x.cp.award('g','u',80,'test','other',now)).awarded).toBe(20);expect((await x.repo.rankings('g',null,10))[0]).toMatchObject({sectId:sect.id,cp:100});x.db.close();});
 it('tracks weekly quests once per business event and rewards reputation once',async()=>{const x=setup();await xp(x.cultivation,'u');await x.service.create('g','u','Thanh Vân');for(let n=0;n<100;n++){await x.cp.recordCorrect('g','u',`q:${n}`,new Date('2026-11-11T00:00:00Z'));}await x.cp.recordCorrect('g','u','q:0',new Date('2026-11-11T00:00:00Z'));const quests=await x.service.quests('g','u');expect(quests.find(q=>q.questKey==='correct_answers')).toMatchObject({progress:100,rewardedAt:expect.any(String)});expect((await x.service.profile('g','u'))?.sect.reputation).toBe(100);x.db.close();});
 it('sorts cultivation ranks deterministically',async()=>{const x=setup();await xp(x.cultivation,'a',200);await xp(x.cultivation,'b',200);const rows=await x.repo.cultivationRanks('g');expect(rows.map(r=>r.userId)).toEqual(['a','b']);x.db.close();});
});
