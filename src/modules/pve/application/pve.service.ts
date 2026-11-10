import { randomUUID } from 'node:crypto';
import { vietnamDate, type XpService } from '../../cultivation/application/xp.service.js';
import { PVE_CONFIG } from '../domain/pve.config.js';
import { PveError, type HskLevel, type PackQuestion, type PveKind, type PveRepository, type PveRun } from '../domain/pve.types.js';
import type { QuestionPackService } from './question-pack.service.js';

export class PveService {
  constructor(
    private readonly repo: PveRepository,
    private readonly packs: QuestionPackService,
    private readonly xp: XpService,
  ) {}

  async createSecret(guild: string, channel: string, user: string, name: string, level: HskLevel, random: () => number = Math.random) {
    await this.ensureFree(guild, user);
    return this.create('secret', guild, channel, user, name, level, null,
      this.packs.select(level, PVE_CONFIG.secretQuestions, random), 'ACTIVE');
  }

  async openBoss(
    guild: string, channel: string, user: string, name: string, level: HskLevel,
    now = new Date(), random: () => number = Math.random,
  ) {
    const event = bossEvent(now);
    if (!event.open) throw new PveError('Boss HSK chỉ mở từ Thứ Bảy 19:00 đến Chủ nhật 23:59 (giờ Việt Nam).');
    if (await this.repo.bossWeek(guild, event.weekKey)) throw new PveError('Server đã mở một trận Boss trong tuần này.');
    await this.ensureFree(guild, user);
    return this.create('boss', guild, channel, user, name, level, event.weekKey,
      this.packs.select(level, PVE_CONFIG.bossQuestions, random), 'WAITING');
  }

  private async create(
    kind: PveKind, guild: string, channel: string, user: string, name: string,
    level: HskLevel, week: string | null, questions: PackQuestion[], status: 'ACTIVE' | 'WAITING',
  ): Promise<PveRun> {
    const now = new Date().toISOString();
    const run: PveRun = {
      id: randomUUID(), kind, guildId: guild, channelId: channel, ownerId: user, level, status,
      currentRound: 0, correctCount: 0, score: 0, bossHp: null, bossMaxHp: null, messageId: null,
      roundStartedAt: null, roundDeadline: null, weekKey: week, createdAt: now, updatedAt: now, completedAt: null,
    };
    try {
      await this.repo.create(run, questions, name);
    } catch (error) {
      if (error instanceof Error && (/(UNIQUE|active pve)/u.test(error.message) || 'code' in error && error.code === '23505')) {
        throw new PveError('Đã có phiên PvE xung đột hoặc Boss tuần này đã được mở.');
      }
      throw error;
    }
    return run;
  }

  private async ensureFree(guild: string, user: string): Promise<void> {
    if (await this.repo.activeFor(guild, user)) throw new PveError('Bạn đang tham gia một phiên PvE khác trong server này.');
  }

  async findBoss(guild: string, channel: string) { return this.repo.bossChannel(guild, channel); }

  async get(id: string): Promise<PveRun> {
    const run = await this.repo.get(id);
    if (!run) throw new PveError('Không tìm thấy phiên PvE.');
    return run;
  }

  players(id: string) { return this.repo.players(id); }

  async current(id: string) {
    const run = await this.get(id);
    const round = await this.repo.round(id, run.currentRound);
    if (!round) throw new PveError('Không tìm thấy câu hiện tại.');
    return round;
  }

  async owned(id: string, guild: string, user: string, messageId?: string): Promise<PveRun> {
    const run = await this.get(id);
    if (run.guildId !== guild || !(await this.players(id)).some((player) => player.userId === user)) {
      throw new PveError('Bạn không thuộc phiên PvE này.');
    }
    if (messageId && run.messageId !== messageId) throw new PveError('Đây là giao diện PvE cũ.');
    return run;
  }

  async bind(id: string, messageId: string): Promise<void> {
    if (!await this.repo.bind(id, messageId, new Date().toISOString())) throw new PveError('Không liên kết được message PvE.');
  }

  async joinBoss(id: string, guild: string, user: string, name: string) {
    await this.ensureFree(guild, user);
    if (!await this.repo.join(id, guild, user, name, PVE_CONFIG.bossMaxPlayers, new Date().toISOString())) {
      throw new PveError('Không thể tham gia Boss: phòng đã bắt đầu hoặc đầy.');
    }
    return this.players(id);
  }

  async startBoss(id: string, guild: string, user: string, isAdmin = false): Promise<PveRun> {
    const run = await this.get(id);
    if (run.guildId !== guild || run.kind !== 'boss' || run.status !== 'WAITING') throw new PveError('Boss không ở trạng thái chờ.');
    if (run.ownerId !== user && !isAdmin) throw new PveError('Chỉ chủ phòng hoặc admin được bắt đầu.');
    const count = (await this.players(id)).length;
    if (count < PVE_CONFIG.bossMinPlayers) throw new PveError('Cần ít nhất 2 người.');
    if (!await this.repo.activateBoss(id, count * PVE_CONFIG.bossHpPerPlayer, new Date().toISOString())) {
      throw new PveError('Boss vừa đổi trạng thái.');
    }
    return this.get(id);
  }

  async openRound(id: string, index: number, sent = new Date()): Promise<void> {
    const run = await this.get(id);
    const duration = run.kind === 'secret' ? PVE_CONFIG.secretRoundMs : PVE_CONFIG.bossRoundMs;
    if (!await this.repo.open(id, index, sent.toISOString(), new Date(sent.getTime() + duration).toISOString())) {
      throw new PveError('Không mở được vòng PvE.');
    }
  }

  async answer(id: string, index: number, user: string, option: number, at = new Date()) {
    const result = await this.repo.answer(id, index, user, option, at);
    if (!result) throw new PveError('Đáp án bị từ chối: trùng, sai vòng hoặc quá hạn.');
    return result;
  }

  async close(id: string, index: number, now = new Date()): Promise<PveRun> {
    const run = await this.get(id);
    const total = run.kind === 'secret' ? 15 : 10;
    const updated = await this.repo.close(id, index, now.toISOString(), total);
    if (!updated) throw new PveError('Vòng đã được xử lý.');
    if (updated.status === 'COMPLETED' || updated.status === 'FAILED') await this.reward(updated, now);
    return updated;
  }

  async cancel(id: string, guild: string, user: string, isAdmin = false): Promise<void> {
    const run = await this.get(id);
    if (run.guildId !== guild || (run.ownerId !== user && !isAdmin)) throw new PveError('Chỉ chủ phòng hoặc admin được hủy.');
    if (!await this.repo.cancel(id, new Date().toISOString())) throw new PveError('Phiên đã kết thúc.');
  }

  due() { return this.repo.due(new Date().toISOString()); }
  cancelUnsafe(id: string) { return this.repo.cancel(id, new Date().toISOString()); }
  cancelActiveOnRestart() { return this.repo.cancelActive(new Date().toISOString()); }
  secretHistory(guild: string, user: string) { return this.repo.history(guild, user, 'secret'); }
  bossHistory(guild: string, user: string) { return this.repo.history(guild, user, 'boss'); }
  bossLeaderboard(guild: string) { return this.repo.bossLeaderboard(guild); }
  mistakes(id: string, user: string) { return this.repo.mistakes(id, user); }
  stageCorrect(id: string, user: string, endExclusive: number) { return this.repo.stageCorrect(id, user, endExclusive); }
  event(now = new Date()) { return bossEvent(now); }

  private async reward(run: PveRun, now: Date): Promise<void> {
    if (run.kind === 'secret' && run.status === 'COMPLETED') {
      const date = vietnamDate(now);
      const award = await this.xp.awardExternal(
        run.guildId, run.ownerId, PVE_CONFIG.secretXp, 'secret_realm_clear',
        `secret:${run.guildId}:${run.ownerId}:${date}`, { sessionId: run.id, now },
      );
      await this.repo.markXp(run.id, run.ownerId, award.awarded);
      return;
    }
    if (run.kind === 'boss' && run.status === 'COMPLETED') {
      for (const player of await this.players(run.id)) {
        if (player.correctCount < PVE_CONFIG.bossMinCorrect || player.answeredCount < 10) continue;
        const award = await this.xp.awardExternal(
          run.guildId, player.userId, PVE_CONFIG.bossXp, 'boss_hsk_win',
          `boss:${run.guildId}:${run.weekKey}:${player.userId}`, { sessionId: run.id, now },
        );
        await this.repo.markXp(run.id, player.userId, award.awarded);
      }
    }
  }
}

export function bossEvent(now: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const day = get('weekday');
  const hour = Number(get('hour'));
  const open = (day === 'Sat' && hour >= 19) || day === 'Sun';
  const local = `${get('year')}-${get('month')}-${get('day')}`;
  const date = new Date(`${local}T12:00:00Z`);
  if (day === 'Sun') date.setUTCDate(date.getUTCDate() - 1);
  return { open, weekKey: date.toISOString().slice(0, 10) };
}
