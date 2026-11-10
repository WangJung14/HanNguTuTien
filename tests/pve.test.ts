import Database from 'better-sqlite3';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyProgressMigrations } from '../src/modules/bag/infrastructure/migrations.js';
import { applyDeckMigrations } from '../src/modules/decks/infrastructure/migrations.js';
import { applyDictationMigrations } from '../src/modules/dictation/infrastructure/migrations.js';
import { applyCultivationMigrations } from '../src/modules/cultivation/infrastructure/migrations.js';
import { applyPhase41Migrations } from '../src/modules/quests/infrastructure/migrations.js';
import { applyMountainMigrations } from '../src/modules/mountain/infrastructure/migrations.js';
import { applyPveMigrations } from '../src/modules/pve/infrastructure/migrations.js';
import { SqliteCultivationRepository } from '../src/modules/cultivation/infrastructure/sqlite-cultivation.repository.js';
import { XpService } from '../src/modules/cultivation/application/xp.service.js';
import { QuestionPackService } from '../src/modules/pve/application/question-pack.service.js';
import { SqlitePveRepository } from '../src/modules/pve/infrastructure/sqlite-pve.repository.js';
import { PveService, bossEvent } from '../src/modules/pve/application/pve.service.js';

function setup() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys=ON');
  applyProgressMigrations(db); applyDeckMigrations(db); applyDictationMigrations(db);
  applyCultivationMigrations(db); applyPhase41Migrations(db); applyMountainMigrations(db); applyPveMigrations(db);
  const cultivation = new SqliteCultivationRepository(db);
  const repo = new SqlitePveRepository(db);
  const service = new PveService(repo, new QuestionPackService(), new XpService(cultivation));
  return { db, repo, cultivation, service };
}
const saturday = new Date('2026-11-14T12:00:00.000Z');

async function finishSecret(service: PveService, user: string, correct = 12) {
  const run = await service.createSecret('g', `c-${user}`, user, user, 'HSK1', () => 0);
  for (let index = 0; index < 15; index += 1) {
    const time = new Date(saturday.getTime() + index * 20_000);
    await service.openRound(run.id, index, time);
    const answerIndex = (await service.current(run.id)).question.correctIndex;
    await service.answer(run.id, index, user,
      index < correct ? answerIndex : (answerIndex + 1) % 4, new Date(time.getTime() + 100));
    await service.close(run.id, index, new Date(time.getTime() + 15_000));
  }
  return { run: await service.get(run.id), player: (await service.players(run.id))[0]! };
}

describe('Question packs and event time', () => {
  it('loads 15 reviewed questions for each HSK level', () => {
    expect(new QuestionPackService().counts()).toEqual({ HSK1: 15, HSK2: 15, HSK3: 15 });
  });
  it('rejects duplicate or ambiguous imported JSON', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'pve-pack-')), 'bad.json');
    writeFileSync(path, JSON.stringify([{
      id: 'x', level: 'HSK1', type: 'han_vi', prompt: '你', options: ['a', 'a', 'b', 'c'],
      correctIndex: 0, explanation: 'x', hanzi: '你', pinyin: 'nǐ', meaning: 'bạn',
    }]));
    expect(() => new QuestionPackService(path)).toThrow('trùng');
  });
  it('uses the Vietnam weekend event window', () => {
    expect(bossEvent(new Date('2026-11-14T11:59:00Z')).open).toBe(false);
    expect(bossEvent(new Date('2026-11-14T12:00:00Z'))).toMatchObject({ open: true, weekKey: '2026-11-14' });
    expect(bossEvent(new Date('2026-11-15T16:59:00Z')).open).toBe(true);
  });
});

describe('Secret realm', () => {
  it('passes at 12/15, records mistakes and grants only one daily reward', async () => {
    const { db, service, cultivation } = setup();
    const first = await finishSecret(service, 'u', 12);
    expect(first.run.status).toBe('COMPLETED');
    expect(first.player.xpAwarded).toBe(20);
    expect(await service.mistakes(first.run.id, 'u')).toHaveLength(3);
    const second = await finishSecret(service, 'u', 15);
    expect(second.player.xpAwarded).toBe(0);
    expect((await cultivation.getOrCreateProfile('g', 'u', saturday.toISOString())).totalXp).toBe(20);
    db.close();
  });

  it('fails without XP and counts a timeout as a completed round', async () => {
    const { db, service } = setup();
    const run = await service.createSecret('g', 'c', 'u', 'U', 'HSK1');
    const time = new Date();
    await service.openRound(run.id, 0, time);
    await service.close(run.id, 0, new Date(time.getTime() + 15_000));
    expect((await service.players(run.id))[0]).toMatchObject({ completedRounds: 1, answeredCount: 0, xpAwarded: 0 });
    await service.cancelUnsafe(run.id);
    db.close();
  });
});

describe('Boss HSK', () => {
  it('applies concurrent damage, rejects duplicate answers, wins and rewards eligible active players', async () => {
    const { db, service } = setup();
    const run = await service.openBoss('g', 'boss', 'u1', 'Một', 'HSK1', saturday, () => 0);
    await service.joinBoss(run.id, 'g', 'u2', 'Hai');
    await service.startBoss(run.id, 'g', 'u1');
    for (let index = 0; index < 10; index += 1) {
      const time = new Date(saturday.getTime() + index * 15_000);
      await service.openRound(run.id, index, time);
      const correct = (await service.current(run.id)).question.correctIndex;
      const wrong = (correct + 1) % 4;
      await service.answer(run.id, index, 'u1', index < 6 ? correct : wrong, new Date(time.getTime() + 100));
      await service.answer(run.id, index, 'u2', index < 6 ? correct : wrong, new Date(time.getTime() + 120));
      if (index === 0) {
        await expect(service.answer(run.id, index, 'u2', correct, new Date(time.getTime() + 130))).rejects.toThrow('trùng');
      }
      await service.close(run.id, index, new Date(time.getTime() + 12_000));
    }
    const final = await service.get(run.id);
    const players = await service.players(run.id);
    expect(final).toMatchObject({ status: 'COMPLETED', bossHp: 0, bossMaxHp: 120 });
    expect(players.map((player) => [player.damage, player.xpAwarded])).toEqual([[60, 30], [60, 30]]);
    await expect(service.openBoss('g', 'other', 'u3', 'Ba', 'HSK1', saturday)).rejects.toThrow('tuần');
    db.close();
  });

  it('does not reward AFK/ineligible players and cancels unsafe active runs', async () => {
    const { db, service } = setup();
    const run = await service.openBoss('g', 'boss', 'u1', 'Một', 'HSK1', saturday);
    await service.joinBoss(run.id, 'g', 'u2', 'Hai');
    await service.startBoss(run.id, 'g', 'u1');
    expect(await service.cancelActiveOnRestart()).toBe(1);
    expect((await service.get(run.id)).status).toBe('CANCELLED');
    expect((await service.players(run.id)).every((player) => player.xpAwarded === 0)).toBe(true);
    db.close();
  });

  it('persists leaderboard and migrates v7 data without loss', async () => {
    const { db, service } = setup();
    expect(await service.bossLeaderboard('g')).toEqual([]);
    db.close();
    const old = new Database(':memory:');
    applyProgressMigrations(old); applyDeckMigrations(old); applyDictationMigrations(old);
    applyCultivationMigrations(old); applyPhase41Migrations(old); applyMountainMigrations(old);
    old.prepare(`INSERT INTO cultivation_profiles(guild_id,user_id,total_xp,major_index,role_sync_pending,created_at,updated_at)VALUES('g','u',99,0,0,'x','x')`).run();
    applyPveMigrations(old);
    expect(old.pragma('user_version', { simple: true })).toBe(8);
    expect(old.prepare('SELECT total_xp AS xp FROM cultivation_profiles').get()).toEqual({ xp: 99 });
    old.close();
  });
});
