import { randomUUID } from 'node:crypto';
import type { DictationService } from '../../dictation/index.js';
import { REALMS, XP_CONFIG } from '../domain/cultivation.config.js';
import { CultivationError, type BreakthroughAttempt, type CultivationRepository } from '../domain/cultivation.types.js';
import type { RealmService } from './realm.service.js';

export class BreakthroughService {
  constructor(private readonly repository: CultivationRepository, private readonly realms: RealmService,
    private readonly dictation: DictationService) {}

  listDecks(guildId: string, userId: string) { return this.dictation.listOwnedDecks(guildId, userId); }

  async start(guildId: string, userId: string, deckId: number, random: () => number = Math.random) {
    const progress = await this.realms.getProgress(guildId, userId);
    if (!progress.nextMajor) throw new CultivationError('Đạo hữu đã đạt cảnh giới tối cao Phi Thăng.');
    if (!progress.needsBreakthrough) throw new CultivationError(`Cần ${progress.nextMajor.minXp} XP để khiêu chiến Thiên Kiếp tiếp theo.`);
    const active = await this.repository.findActiveAttempt(guildId, userId);
    if (active) {
      return { attempt: active, audio: await this.dictation.synthesizePublic(active.questions[active.currentIndex]!.simplified) };
    }
    const failed = await this.repository.latestFailedAttempt(guildId, userId);
    if (failed?.cooldownUntil && failed.cooldownUntil > new Date().toISOString()) {
      throw new CultivationError(`Thiên Kiếp chưa tan. Có thể thử lại sau <t:${Math.floor(Date.parse(failed.cooldownUntil) / 1000)}:R>.`);
    }
    const candidates = await this.dictation.getEligibleQuestions(guildId, userId, deckId);
    if (candidates.length < 10) throw new CultivationError(`Bộ từ chỉ có ${candidates.length}/10 từ hợp lệ; cần ít nhất 10 từ để mở Thiên Kiếp.`);
    const questions = this.dictation.choosePublicQuestions(candidates, 10, random).map((q) => ({ ...q, answer: null, correct: null }));
    const audio = await this.dictation.synthesizePublic(questions[0]!.simplified);
    const now = new Date().toISOString();
    const value: BreakthroughAttempt = { id: randomUUID(), guildId, userId,
      fromMajor: progress.profile.majorIndex, toMajor: progress.profile.majorIndex + 1, deckId,
      status: 'active', currentIndex: 0, correctCount: 0, questions, cooldownUntil: null,
      messageId: null, createdAt: now, updatedAt: now, completedAt: null };
    try { await this.repository.createAttempt(value); } catch (error) {
      if (error instanceof Error && /UNIQUE constraint failed/u.test(error.message)) throw new CultivationError('Bạn đang có một Thiên Kiếp chưa hoàn thành.');
      throw error;
    }
    return { attempt: value, audio };
  }

  async getOwned(id: string, guildId: string, userId: string, messageId?: string): Promise<BreakthroughAttempt> {
    const value = await this.repository.getAttempt(id);
    if (!value || value.guildId !== guildId || value.userId !== userId) throw new CultivationError('Không tìm thấy Thiên Kiếp của bạn.');
    if (messageId && value.messageId !== messageId) throw new CultivationError('Đây là giao diện Thiên Kiếp cũ.');
    return value;
  }
  async bindMessage(id: string, messageId: string) {
    if (!await this.repository.bindAttemptMessage(id, messageId, new Date().toISOString())) throw new CultivationError('Không thể liên kết giao diện Thiên Kiếp.');
  }
  async replay(value: BreakthroughAttempt) {
    if (value.status !== 'active') throw new CultivationError('Thiên Kiếp này đã kết thúc.');
    return this.dictation.synthesizePublic(value.questions[value.currentIndex]!.simplified);
  }
  async answer(value: BreakthroughAttempt, answer: string) {
    const question = value.questions[value.currentIndex]!;
    const correct = this.dictation.evaluatePublicAnswer(answer, question);
    const updated = await this.repository.answerAttempt(value.id, value.currentIndex, answer, correct, new Date().toISOString());
    if (!updated) throw new CultivationError('Câu này đã được trả lời hoặc giao diện đã cũ.');
    return updated;
  }
  async advance(value: BreakthroughAttempt) {
    const next = value.currentIndex + 1 < value.questions.length ? value.questions[value.currentIndex + 1] : null;
    const audio = next ? await this.dictation.synthesizePublic(next.simplified) : null;
    const now = new Date();
    const updated = await this.repository.advanceAttempt(value.id, value.currentIndex, now.toISOString(),
      new Date(now.getTime() + XP_CONFIG.breakthroughCooldownMs).toISOString());
    if (!updated) throw new CultivationError('Không thể chuyển câu Thiên Kiếp; hãy kiểm tra câu hiện tại đã trả lời chưa.');
    return { attempt: updated, audio, realm: REALMS[updated.toMajor]! };
  }
  history(guildId: string, userId: string) { return this.repository.listAttempts(guildId, userId, 10); }
}
