import { randomUUID } from 'node:crypto';
import { vietnamDate, type XpService } from '../../cultivation/application/xp.service.js';
import { MOUNTAIN_CONFIG } from '../domain/score-rules.js';
import { MountainError, type MountainKind, type MountainMatch, type MountainRepository } from '../domain/mountain.types.js';
import type { MountainQuestionService } from './question.service.js';

export class MountainMatchService {
  constructor(
    private readonly repo: MountainRepository,
    private readonly questions: MountainQuestionService,
    private readonly xp: XpService,
  ) {}

  async create(
    guildId: string, channelId: string, userId: string, name: string, deckId: number,
    kind: MountainKind, random: () => number = Math.random,
  ): Promise<MountainMatch> {
    if (await this.repo.findPlayerActive(guildId, userId)) {
      throw new MountainError('Bạn đang ở trong một trận Leo Núi khác trong server này.');
    }
    if (kind === 'multi' && await this.repo.findChannel(guildId, channelId)) {
      throw new MountainError('Channel này đã có một phòng Leo Núi đang hoạt động.');
    }
    const built = await this.questions.build(guildId, userId, deckId, random);
    const now = new Date().toISOString();
    const match: MountainMatch = {
      id: randomUUID(), guildId, channelId, ownerId: userId, kind, deckId, deckName: built.deckName,
      status: kind === 'solo' ? 'ACTIVE' : 'WAITING', currentRound: 0, messageId: null,
      roundStartedAt: null, roundDeadline: null, createdAt: now, updatedAt: now,
    };
    try {
      await this.repo.create(match, built.questions, name);
    } catch (error) {
      if (error instanceof Error && (/UNIQUE constraint/u.test(error.message) || 'code' in error && error.code === '23505')) {
        throw new MountainError('Không thể tạo trận do phòng hoặc người chơi đã có trận khác.');
      }
      throw error;
    }
    return match;
  }

  async getOwned(id: string, guildId: string, userId: string, messageId?: string): Promise<MountainMatch> {
    const match = await this.repo.get(id);
    if (!match || match.guildId !== guildId) throw new MountainError('Không tìm thấy trận Leo Núi.');
    if (!(await this.repo.players(id)).some((player) => player.userId === userId)) {
      throw new MountainError('Bạn không thuộc trận này.');
    }
    if (messageId && match.messageId !== messageId) throw new MountainError('Đây là giao diện trận cũ.');
    return match;
  }

  findChannel(guildId: string, channelId: string) { return this.repo.findChannel(guildId, channelId); }

  async bind(id: string, messageId: string): Promise<void> {
    if (!await this.repo.bind(id, messageId, new Date().toISOString())) {
      throw new MountainError('Không thể liên kết message trận đấu.');
    }
  }

  async join(matchId: string, guildId: string, userId: string, name: string) {
    if (!await this.repo.join(matchId, guildId, userId, name, new Date().toISOString(), MOUNTAIN_CONFIG.maxPlayers)) {
      throw new MountainError('Không thể tham gia: phòng đã bắt đầu/đầy hoặc bạn đang ở trận khác.');
    }
    return this.repo.players(matchId);
  }

  async startMulti(id: string, guildId: string, userId: string): Promise<MountainMatch> {
    const match = await this.repo.get(id);
    if (!match || match.guildId !== guildId || match.kind !== 'multi' || match.status !== 'WAITING') {
      throw new MountainError('Phòng không còn ở trạng thái chờ.');
    }
    if (match.ownerId !== userId) throw new MountainError('Chỉ chủ phòng được bắt đầu.');
    if ((await this.repo.players(id)).length < 2) throw new MountainError('Cần ít nhất 2 người chơi.');
    if (!await this.repo.activate(id, new Date().toISOString())) throw new MountainError('Phòng vừa thay đổi trạng thái.');
    const active = await this.repo.get(id);
    if (!active) throw new MountainError('Không tìm thấy phòng vừa bắt đầu.');
    return active;
  }

  async currentRound(id: string) {
    const match = await this.repo.get(id);
    if (!match) throw new MountainError('Không tìm thấy trận.');
    const round = await this.repo.getRound(id, match.currentRound);
    if (!round) throw new MountainError('Không tìm thấy vòng hiện tại.');
    return round;
  }

  async openRound(id: string, index: number, sentAt = new Date()) {
    const deadline = new Date(sentAt.getTime() + MOUNTAIN_CONFIG.roundMs);
    if (!await this.repo.openRound(id, index, sentAt.toISOString(), deadline.toISOString())) {
      throw new MountainError('Không thể mở vòng thi.');
    }
    return { openedAt: sentAt, deadline };
  }

  async answer(id: string, index: number, userId: string, option: number, receivedAt = new Date()) {
    const answer = await this.repo.answer(id, index, userId, option, receivedAt);
    if (!answer) throw new MountainError('Đáp án bị từ chối: đã trả lời, sai vòng hoặc quá 10 giây.');
    return answer;
  }

  async closeRound(id: string, index: number, now = new Date()): Promise<MountainMatch> {
    const updated = await this.repo.closeAndAdvance(id, index, now.toISOString());
    if (!updated) throw new MountainError('Vòng đã được xử lý trước đó.');
    if (updated.status === 'COMPLETED') await this.reward(updated, now);
    return updated;
  }

  async cancel(id: string, guildId: string, userId: string, isAdmin = false): Promise<void> {
    const match = await this.repo.get(id);
    if (!match || match.guildId !== guildId) throw new MountainError('Không tìm thấy trận.');
    if (match.ownerId !== userId && !isAdmin) throw new MountainError('Chỉ chủ phòng hoặc admin được hủy.');
    if (!await this.repo.cancel(id, 'CANCELLED', new Date().toISOString())) throw new MountainError('Trận đã kết thúc.');
  }

  async expireWaiting(now = new Date()): Promise<void> {
    const cutoff = new Date(now.getTime() - MOUNTAIN_CONFIG.waitingTtlMs).toISOString();
    for (const match of await this.repo.expiredWaiting(cutoff)) {
      await this.repo.cancel(match.id, 'EXPIRED', now.toISOString());
    }
  }

  cancelActiveOnRestart() { return this.repo.cancelActiveOnRestart(new Date().toISOString()); }
  players(id: string) { return this.repo.players(id); }
  leaderboard(guildId: string) { return this.repo.leaderboard(guildId); }
  history(guildId: string, userId: string) { return this.repo.history(guildId, userId); }
  due(now = new Date()) { return this.repo.due(now.toISOString()); }
  cancelUnsafe(id: string) { return this.repo.cancel(id, 'CANCELLED', new Date().toISOString()); }

  private async reward(match: MountainMatch, now: Date): Promise<void> {
    const date = vietnamDate(now);
    for (const player of await this.repo.players(match.id)) {
      if (player.completedRounds !== 10 || player.correctCount < MOUNTAIN_CONFIG.minCorrectForXp || player.xpAwarded > 0) continue;
      if (await this.repo.rewardedCount(match.guildId, player.userId, date) >= MOUNTAIN_CONFIG.dailyXpMatches) continue;
      const award = await this.xp.awardExternal(
        match.guildId, player.userId, MOUNTAIN_CONFIG.xpReward, 'mountain_complete',
        `mountain:${match.id}:${player.userId}`, { sessionId: match.id, now },
      );
      await this.repo.markXp(match.id, player.userId, award.awarded, date);
    }
  }
}
