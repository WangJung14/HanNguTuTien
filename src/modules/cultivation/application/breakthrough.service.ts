import { randomUUID } from 'node:crypto';
import type { DictationService } from '../../dictation/index.js';
import { REALMS, XP_CONFIG } from '../domain/cultivation.config.js';
import { CultivationError, type BreakthroughAttempt, type CultivationRepository } from '../domain/cultivation.types.js';
import type { RealmService } from './realm.service.js';

export class BreakthroughService {
  constructor(private readonly repository: CultivationRepository, private readonly realms: RealmService,
    private readonly dictation: DictationService,
    private readonly onPassed?: (attempt: BreakthroughAttempt) => Promise<void>) {}

  listDecks(guildId: string, userId: string) { return this.dictation.listOwnedDecks(guildId, userId); }

  async start(guildId: string, userId: string, deckId: number, random: () => number = Math.random) {
    const progress = await this.realms.getProgress(guildId, userId);
    if (!progress.nextMajor) throw new CultivationError('Đạo hữu đã đạt cảnh giới tối cao Phi Thăng.');
    if (!progress.needsBreakthrough) throw new CultivationError(`Cần ${progress.nextMajor.minXp} XP để khiêu chiến Thiên Kiếp tiếp theo.`);
    const active = await this.repository.findActiveAttempt(guildId, userId);
    if (active) {
      const audios = await this.synthesizeWorksheet(active);
      return { attempt: active, audio: audios[active.currentIndex]!, audios };
    }
    const failed = await this.repository.latestFailedAttempt(guildId, userId);
    if (failed?.cooldownUntil && failed.cooldownUntil > new Date().toISOString()) {
      throw new CultivationError(`Thiên Kiếp chưa tan. Có thể thử lại sau <t:${Math.floor(Date.parse(failed.cooldownUntil) / 1000)}:R>.`);
    }
    const candidates = await this.dictation.getEligibleQuestions(guildId, userId, deckId);
    if (candidates.length < 10) throw new CultivationError(`Bộ từ chỉ có ${candidates.length}/10 từ hợp lệ; cần ít nhất 10 từ để mở Thiên Kiếp.`);
    const questions = this.dictation.choosePublicQuestions(candidates, 10, random).map((q) => ({ ...q, answer: null, correct: null }));
    const audios = await this.synthesizeQuestions(questions);
    const now = new Date().toISOString();
    const value: BreakthroughAttempt = { id: randomUUID(), guildId, userId,
      fromMajor: progress.profile.majorIndex, toMajor: progress.profile.majorIndex + 1, deckId,
      status: 'active', currentIndex: 0, correctCount: 0, questions, cooldownUntil: null,
      messageId: null, createdAt: now, updatedAt: now, completedAt: null };
    try { await this.repository.createAttempt(value); } catch (error) {
      if (error instanceof Error && /UNIQUE constraint failed/u.test(error.message)) throw new CultivationError('Bạn đang có một Thiên Kiếp chưa hoàn thành.');
      throw error;
    }
    return { attempt: value, audio: audios[0]!, audios };
  }

  async synthesizeWorksheet(value: BreakthroughAttempt) {
    if (value.status !== 'active') throw new CultivationError('Thiên Kiếp này đã kết thúc.');
    return this.synthesizeQuestions(value.questions);
  }

  async submitWorksheetBatch(value: BreakthroughAttempt, batchStart: number, answers: string[]) {
    if (value.status !== 'active') throw new CultivationError('Thiên Kiếp này đã kết thúc.');
    if (batchStart !== 0 && batchStart !== 5) throw new CultivationError('Nhóm câu Thiên Kiếp không hợp lệ.');
    const batchEnd = Math.min(batchStart + 5, value.questions.length);
    if (answers.length !== batchEnd - batchStart || answers.some((answer) => !answer.trim())) {
      throw new CultivationError('Hãy trả lời đầy đủ mọi câu trong phiếu trước khi nộp.');
    }

    let current = await this.repository.getAttempt(value.id);
    if (!current) throw new CultivationError('Không tìm thấy Thiên Kiếp của bạn.');
    if (current.status !== 'active' || current.currentIndex >= batchEnd) return current;
    if (current.currentIndex < batchStart) throw new CultivationError('Hãy hoàn thành nhóm câu trước trước khi nộp nhóm này.');

    while (current.status === 'active' && current.currentIndex < batchEnd) {
      const index = current.currentIndex;
      const answer = answers[index - batchStart]!.trim();
      const answered = await this.answer(current, answer);
      current = (await this.advanceWithoutAudio(answered)).attempt;
    }
    return current;
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
    if (updated) return updated;

    const latest = await this.repository.getAttempt(value.id);
    if (latest?.status === 'active' && latest.currentIndex === value.currentIndex &&
        typeof latest.questions[value.currentIndex]?.answer === 'string') {
      return latest;
    }
    throw new CultivationError('Câu này đã được trả lời hoặc giao diện đã cũ.');
  }
  async advance(value: BreakthroughAttempt) {
    const next = value.currentIndex + 1 < value.questions.length ? value.questions[value.currentIndex + 1] : null;
    const audio = next ? await this.dictation.synthesizePublic(next.simplified) : null;
    const now = new Date();
    const updated = await this.repository.advanceAttempt(value.id, value.currentIndex, now.toISOString(),
      new Date(now.getTime() + XP_CONFIG.breakthroughCooldownMs).toISOString());
    if (!updated) throw new CultivationError('Không thể chuyển câu Thiên Kiếp; hãy kiểm tra câu hiện tại đã trả lời chưa.');
    if (updated.status === 'passed') await this.onPassed?.(updated);
    return { attempt: updated, audio, realm: REALMS[updated.toMajor]! };
  }

  private async advanceWithoutAudio(value: BreakthroughAttempt) {
    const now = new Date();
    const updated = await this.repository.advanceAttempt(value.id, value.currentIndex, now.toISOString(),
      new Date(now.getTime() + XP_CONFIG.breakthroughCooldownMs).toISOString());
    if (!updated) {
      const latest = await this.repository.getAttempt(value.id);
      if (latest && (latest.currentIndex > value.currentIndex || latest.status !== 'active')) {
        return { attempt: latest, realm: REALMS[latest.toMajor]! };
      }
      throw new CultivationError('Không thể chuyển nhóm câu Thiên Kiếp; dữ liệu vừa được thay đổi.');
    }
    if (updated.status === 'passed') await this.onPassed?.(updated);
    return { attempt: updated, realm: REALMS[updated.toMajor]! };
  }

  private async synthesizeQuestions(questions: BreakthroughAttempt['questions']) {
    const audios = [];
    for (const question of questions) audios.push(await this.dictation.synthesizePublic(question.simplified));
    return audios;
  }
  history(guildId: string, userId: string) { return this.repository.listAttempts(guildId, userId, 10); }
}
