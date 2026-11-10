import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applyProgressMigrations } from '../src/modules/bag/infrastructure/migrations.js';
import { applyDeckMigrations } from '../src/modules/decks/infrastructure/migrations.js';
import { applyDictationMigrations } from '../src/modules/dictation/infrastructure/migrations.js';
import { applyCultivationMigrations } from '../src/modules/cultivation/infrastructure/migrations.js';
import { applyPhase41Migrations } from '../src/modules/quests/infrastructure/migrations.js';
import { applyMountainMigrations } from '../src/modules/mountain/infrastructure/migrations.js';
import { SqliteCultivationRepository } from '../src/modules/cultivation/infrastructure/sqlite-cultivation.repository.js';
import { XpService } from '../src/modules/cultivation/application/xp.service.js';
import { SqliteMountainRepository } from '../src/modules/mountain/infrastructure/sqlite-mountain.repository.js';
import { MountainMatchService } from '../src/modules/mountain/application/match.service.js';
import type { MountainQuestionService } from '../src/modules/mountain/application/question.service.js';
import { scoreAnswer } from '../src/modules/mountain/domain/score-rules.js';
import { question as questionUi } from '../src/modules/mountain/presentation/mountain-ui.js';

const questions = Array.from({ length: 10 }, (_, index) => ({
  entryId: index + 1,
  direction: (index % 2 ? 'vi_han' : 'han_vi') as 'han_vi' | 'vi_han',
  prompt: `P${index}`, options: [`A${index}`, 'B', 'C', 'D'], correctIndex: 0,
  hanzi: `汉${index}`, meaning: `nghĩa ${index}`,
}));
function setup() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys=ON');
  applyProgressMigrations(sqlite);
  applyDeckMigrations(sqlite);
  applyDictationMigrations(sqlite);
  applyCultivationMigrations(sqlite);
  applyPhase41Migrations(sqlite);
  applyMountainMigrations(sqlite);
  const repo = new SqliteMountainRepository(sqlite);
  const xp = new XpService(new SqliteCultivationRepository(sqlite));
  const questionService = { build: () => ({ deckName: 'Đỉnh Núi', questions }) } as unknown as MountainQuestionService;
  return { sqlite, repo, xp, service: new MountainMatchService(repo, questionService, xp) };
}
async function complete(service: MountainMatchService, channel: string, user: string, correct = 6) {
  const match = await service.create('g', channel, user, user, 1, 'solo');
  for (let index = 0; index < 10; index += 1) {
    const opened = new Date(`2026-11-10T00:${String(index * 2).padStart(2, '0')}:00Z`);
    await service.openRound(match.id, index, opened);
    await service.answer(match.id, index, user, index < correct ? 0 : 1, new Date(opened.getTime() + 500));
    await service.closeRound(match.id, index, new Date(opened.getTime() + 10_000));
  }
  return (await service.players(match.id))[0]!;
}

describe('Mountain score rules', () => {
  it('uses server elapsed-time bands', () => {
    expect([0, 1000, 1001, 2000, 2001, 8000, 8001, 10000, 10001].map((x) => scoreAnswer(x, true)))
      .toEqual([100, 100, 90, 90, 80, 30, 20, 20, 0]);
    expect(scoreAnswer(500, false)).toBe(0);
  });
});

describe('Mountain matches', () => {
  it('accepts one answer, rejects duplicate and late submissions, and does not mark the correct UI option', async () => {
    const { sqlite, service } = setup();
    const match = await service.create('g', 'c', 'u', 'User', 1, 'solo');
    const opened = new Date('2026-11-10T00:00:00Z');
    await service.openRound(match.id, 0, opened);
    await expect(service.answer(match.id, 0, 'u', 0, new Date(opened.getTime() + 900)))
      .resolves.toMatchObject({ correct: true, score: 100 });
    await expect(service.answer(match.id, 0, 'u', 1, new Date(opened.getTime() + 1000))).rejects.toThrow('từ chối');
    const payload = questionUi(match, await service.currentRound(match.id));
    expect(JSON.stringify(payload)).not.toContain('correctIndex');
    await service.closeRound(match.id, 0, new Date(opened.getTime() + 10_000));
    const round = await service.currentRound(match.id);
    await service.openRound(match.id, round.roundIndex, new Date(opened.getTime() + 20_000));
    await expect(service.answer(match.id, 1, 'u', 0, new Date(opened.getTime() + 30_001))).rejects.toThrow('quá 10 giây');
    sqlite.close();
  });

  it('handles competing multiplayer answers independently and blocks double-clicks', async () => {
    const { sqlite, service } = setup();
    const match = await service.create('g', 'c', 'u1', 'Một', 1, 'multi');
    await service.join(match.id, 'g', 'u2', 'Hai');
    await service.startMulti(match.id, 'g', 'u1');
    const time = new Date('2026-11-10T00:00:00Z');
    await service.openRound(match.id, 0, time);
    expect((await service.answer(match.id, 0, 'u1', 0, new Date(time.getTime() + 500))).score).toBe(100);
    expect((await service.answer(match.id, 0, 'u2', 1, new Date(time.getTime() + 600))).score).toBe(0);
    await expect(service.answer(match.id, 0, 'u2', 0, new Date(time.getTime() + 700))).rejects.toThrow();
    sqlite.close();
  });

  it('awards XP for only two eligible completed matches per day', async () => {
    const { sqlite, service } = setup();
    const a = await complete(service, 'c1', 'u');
    const b = await complete(service, 'c2', 'u');
    const c = await complete(service, 'c3', 'u');
    expect([a.xpAwarded, b.xpAwarded, c.xpAwarded]).toEqual([10, 10, 0]);
    sqlite.close();
  });

  it('cancels active matches on restart, expires waiting rooms, and excludes both from leaderboard', async () => {
    const { sqlite, service } = setup();
    await service.create('g', 'c1', 'u1', 'Một', 1, 'solo');
    const waiting = await service.create('g', 'c2', 'u2', 'Hai', 1, 'multi');
    expect(await service.cancelActiveOnRestart()).toBe(1);
    await service.expireWaiting(new Date(Date.parse(waiting.createdAt) + 31 * 60_000));
    expect(await service.leaderboard('g')).toEqual([]);
    sqlite.close();
  });

  it('orders leaderboard by score, correct count and valid response time', async () => {
    const { sqlite, service } = setup();
    await complete(service, 'c1', 'u1', 10);
    await complete(service, 'c2', 'u2', 6);
    const board = await service.leaderboard('g');
    expect(board.map((player) => player.userId)).toEqual(['u1', 'u2']);
    expect(board[0]?.score).toBe(1000);
    sqlite.close();
  });

  it('migrates v6 data without loss', () => {
    const sqlite = new Database(':memory:');
    applyProgressMigrations(sqlite); applyDeckMigrations(sqlite); applyDictationMigrations(sqlite);
    applyCultivationMigrations(sqlite); applyPhase41Migrations(sqlite);
    sqlite.prepare(`INSERT INTO cultivation_profiles(guild_id,user_id,total_xp,major_index,role_sync_pending,created_at,updated_at)VALUES('g','u',321,0,0,'x','x')`).run();
    applyMountainMigrations(sqlite);
    expect(sqlite.pragma('user_version', { simple: true })).toBe(7);
    expect(sqlite.prepare(`SELECT total_xp AS xp FROM cultivation_profiles`).get()).toEqual({ xp: 321 });
    sqlite.close();
  });
});
