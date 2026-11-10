import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applyProgressMigrations } from '../src/modules/bag/infrastructure/migrations.js';
import { applyDeckMigrations } from '../src/modules/decks/infrastructure/migrations.js';
import { applyDictationMigrations } from '../src/modules/dictation/infrastructure/migrations.js';
import { applyCultivationMigrations } from '../src/modules/cultivation/infrastructure/migrations.js';
import { SqliteCultivationRepository } from '../src/modules/cultivation/infrastructure/sqlite-cultivation.repository.js';
import { XpService } from '../src/modules/cultivation/application/xp.service.js';
import { RealmService } from '../src/modules/cultivation/application/realm.service.js';
import { BreakthroughService } from '../src/modules/cultivation/application/breakthrough.service.js';
import { DiscordRoleSync } from '../src/modules/cultivation/infrastructure/discord-role-sync.js';
import type { DictationService } from '../src/modules/dictation/index.js';
import type { Guild } from 'discord.js';

function setup() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  applyProgressMigrations(sqlite); applyDeckMigrations(sqlite); applyDictationMigrations(sqlite); applyCultivationMigrations(sqlite);
  const repository = new SqliteCultivationRepository(sqlite);
  return { sqlite, repository, xp: new XpService(repository), realms: new RealmService(repository) };
}

const questions = Array.from({ length: 10 }, (_, index) => ({
  entryId: index + 1, simplified: `词${index}`, traditional: `詞${index}`,
  pinyin: `cí ${index}`, meaningVi: `từ ${index}`, pinyinKey: `ci${index}`,
}));
function fakeDictation(): DictationService {
  return {
    listOwnedDecks: () => [{ id: 1, name: 'Bộ Thiên Kiếp', wordCount: 10 }],
    getEligibleQuestions: () => questions,
    choosePublicQuestions: (items: typeof questions, count: number) => items.slice(0, count).map(({ pinyinKey: _, ...q }) => q),
    synthesizePublic: async () => ({ data: Buffer.from('wav'), format: 'wav' as const }),
    evaluatePublicAnswer: (answer: string, question: { simplified: string; traditional: string }) =>
      answer === question.simplified || answer === question.traditional,
  } as unknown as DictationService;
}

describe('Cultivation XP', () => {
  it('scores actual dictation outcomes and prevents duplicate rewards', async () => {
    const { sqlite, xp } = setup();
    expect((await xp.awardQuestion('g', 'u', { sessionId: 's', questionIndex: 0, isCorrect: true, usedHint: false, replayCount: 0 })).awarded).toBe(10);
    expect((await xp.awardQuestion('g', 'u', { sessionId: 's', questionIndex: 1, isCorrect: true, usedHint: false, replayCount: 1 })).awarded).toBe(7);
    expect((await xp.awardQuestion('g', 'u', { sessionId: 's', questionIndex: 2, isCorrect: true, usedHint: true, replayCount: 0 })).awarded).toBe(4);
    expect((await xp.awardQuestion('g', 'u', { sessionId: 's', questionIndex: 0, isCorrect: true, usedHint: false, replayCount: 0 })).duplicate).toBe(true);
    expect((await xp.awardCompletion('g', 'u', 's', 10, 10, true)).map((x) => x.awarded)).toEqual([20, 30]);
    sqlite.close();
  });

  it('caps daily XP, records a zero claim, and stays idempotent under competing calls', async () => {
    const { sqlite, repository } = setup();
    const now = '2026-11-10T00:00:00.000Z';
    const first = await repository.addXp('g', 'u', 250, 'test', 'same-key', null, '2026-11-10', now, 200);
    const second = await repository.addXp('g', 'u', 250, 'test', 'same-key', null, '2026-11-10', now, 200);
    const capped = await repository.addXp('g', 'u', 10, 'test', 'capped-key', null, '2026-11-10', now, 200);
    expect(first).toMatchObject({ awarded: 200, capped: true });
    expect(second).toMatchObject({ awarded: 0, duplicate: true });
    expect(capped).toMatchObject({ awarded: 0, capped: true });
    expect((await repository.addXp('g', 'u', 10, 'test', 'capped-key', null, '2026-11-11', now, 200)).duplicate).toBe(true);
    expect((await repository.getOrCreateProfile('g', 'u', now)).totalXp).toBe(200);
    sqlite.close();
  });

  it('persists the guild announcement channel and notifies only newly awarded XP', async () => {
    const { sqlite, repository } = setup();
    sqlite.exec('DROP TABLE xp_announcement_channels');
    applyCultivationMigrations(sqlite);
    const notifications: { amount: number; source: string; totalXp: number }[] = [];
    const xp = new XpService(repository, async (event) => {
      notifications.push({ amount: event.amount, source: event.source, totalXp: event.totalXp });
    });
    await repository.setXpAnnouncementChannel('g', 'channel-1', new Date().toISOString());
    expect(await repository.getXpAnnouncementChannel('g')).toBe('channel-1');

    await xp.awardExternal('g', 'u', 25, 'test_reward', 'reward-1');
    await xp.awardExternal('g', 'u', 25, 'test_reward', 'reward-1');
    expect(notifications).toEqual([{ amount: 25, source: 'test_reward', totalXp: 25 }]);

    await repository.setXpAnnouncementChannel('g', null, new Date().toISOString());
    expect(await repository.getXpAnnouncementChannel('g')).toBeNull();
    sqlite.close();
  });

  it('audits admin rewards and penalties, clamps XP at zero, and demotes major realms', async () => {
    const { sqlite, repository, realms } = setup();
    const now = new Date().toISOString();
    await repository.addXp('g', 'u', 2_500, 'seed', 'admin-adjustment-seed', null, '2026-11-10', now, 10_000);
    expect(await repository.promote('g', 'u', 0, 2, now)).toBe(true);

    const penalty = await repository.adjustXpAsAdmin(
      'g', 'u', 'admin', 'interaction-penalty', 'penalty', 600, 'Lý do phạt', now,
    );
    expect(penalty).toMatchObject({
      amount: 600, previousTotalXp: 2_500, newTotalXp: 1_900,
      previousMajorIndex: 2, newMajorIndex: 1, duplicate: false,
    });
    expect((await realms.getProgress('g', 'u')).major.name).toBe('Luyện Khí');

    const repeated = await repository.adjustXpAsAdmin(
      'g', 'u', 'admin', 'interaction-penalty', 'penalty', 600, 'Lý do phạt', now,
    );
    expect(repeated).toMatchObject({ duplicate: true, newTotalXp: 1_900 });

    const finalPenalty = await repository.adjustXpAsAdmin(
      'g', 'u', 'admin', 'interaction-empty', 'penalty', 10_000, 'Phạt về 0', now,
    );
    expect(finalPenalty).toMatchObject({ amount: 1_900, newTotalXp: 0, newMajorIndex: 0 });

    const reward = await repository.adjustXpAsAdmin(
      'g', 'u', 'admin', 'interaction-reward', 'reward', 125, 'Thưởng sự kiện', now,
    );
    expect(reward).toMatchObject({ amount: 125, previousTotalXp: 0, newTotalXp: 125, newMajorIndex: 0 });
    expect((await repository.getOrCreateProfile('g', 'u', now)).totalXp).toBe(125);
    expect((sqlite.prepare('SELECT count(*) AS count FROM xp_admin_adjustments').get() as { count: number }).count).toBe(3);
    sqlite.close();
  });
});

describe('Realm progression and breakthrough', () => {
  it('raises minor realms automatically but locks the next major realm', async () => {
    const { sqlite, repository, realms } = setup();
    await repository.addXp('g', 'u', 1750, 'seed', 'seed', null, '2026-11-10', new Date().toISOString(), 999999);
    const locked = await realms.getProgress('g', 'u');
    expect(locked.major.name).toBe('Phàm Nhân');
    expect(locked.needsBreakthrough).toBe(true);
    await repository.promote('g', 'u', 0, 1, new Date().toISOString());
    expect((await realms.getProgress('g', 'u')).label).toContain('tầng 9');
    sqlite.close();
  });

  it('persists an 8/10 success and promotes atomically', async () => {
    const { sqlite, repository, realms } = setup();
    await repository.addXp('g', 'u', 100, 'seed', 'seed-pass', null, '2026-11-10', new Date().toISOString(), 999999);
    const service = new BreakthroughService(repository, realms, fakeDictation());
    let current = (await service.start('g', 'u', 1, () => 0)).attempt;
    for (let index = 0; index < 10; index += 1) {
      current = await service.answer(current, index < 8 ? current.questions[index]!.simplified : 'sai');
      current = (await service.advance(current)).attempt;
    }
    expect(current.status).toBe('passed'); expect(current.correctCount).toBe(8);
    expect((await repository.getOrCreateProfile('g', 'u', new Date().toISOString())).majorIndex).toBe(1);
    const restarted = new SqliteCultivationRepository(sqlite);
    expect((await restarted.getAttempt(current.id))?.status).toBe('passed');
    sqlite.close();
  });

  it('fails below 8/10 without losing XP and enforces cooldown', async () => {
    const { sqlite, repository, realms } = setup();
    await repository.addXp('g', 'u', 100, 'seed', 'seed-fail', null, '2026-11-10', new Date().toISOString(), 999999);
    const service = new BreakthroughService(repository, realms, fakeDictation());
    let current = (await service.start('g', 'u', 1)).attempt;
    for (let index = 0; index < 10; index += 1) {
      current = await service.answer(current, index < 7 ? current.questions[index]!.simplified : 'sai');
      current = (await service.advance(current)).attempt;
    }
    expect(current.status).toBe('failed');
    expect(await repository.getOrCreateProfile('g', 'u', new Date().toISOString())).toMatchObject({ totalXp: 100, majorIndex: 0 });
    await expect(service.start('g', 'u', 1)).rejects.toThrow('thử lại');
    sqlite.close();
  });
});

describe('Cultivation role synchronization', () => {
  it('keeps pending state after Discord failure and clears it on retry', async () => {
    const { sqlite, repository } = setup();
    const now = new Date().toISOString(); await repository.getOrCreateProfile('g', 'u', now);
    await repository.setRealmRole('g', 1, 'role-1', now);
    let allowed = false;
    const memberRoles = new Set<string>();
    const role = { id: 'role-1', name: 'Luyện Khí', position: 1 };
    const guild = { id: 'g', members: {
      me: { permissions: { has: () => allowed }, roles: { highest: { comparePositionTo: () => 1 } } },
      fetch: async () => ({ roles: { cache: { has: (id: string) => memberRoles.has(id) }, add: async (id: string) => { memberRoles.add(id); }, remove: async (ids: string[]) => { ids.forEach((id) => memberRoles.delete(id)); } } }),
    }, roles: { cache: { get: () => role }, fetch: async () => role } } as unknown as Guild;
    const sync = new DiscordRoleSync(repository);
    expect((await sync.sync(guild, 'u', 1)).synced).toBe(false);
    expect((await repository.getOrCreateProfile('g', 'u', now)).roleSyncPending).toBe(true);
    allowed = true;
    expect((await sync.sync(guild, 'u', 1)).synced).toBe(true);
    expect((await repository.getOrCreateProfile('g', 'u', now)).roleSyncPending).toBe(false);
    expect(memberRoles.has('role-1')).toBe(true);
    sqlite.close();
  });
});
