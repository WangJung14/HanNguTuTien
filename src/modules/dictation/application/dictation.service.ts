import { randomUUID } from 'node:crypto';
import type { DeckService } from '../../decks/application/deck.service.js';
import type { DictionaryService } from '../../dictionary/application/dictionary.service.js';
import { gradeAnswer } from '../domain/answer-grader.js';
import { chooseQuestions, eligibleQuestions, type EligibleQuestion } from '../domain/question-selection.js';
import {
  DictationError,
  type AudioProvider,
  type AudioSpeed,
  type DictationQuestion,
  type DictationMode,
  type DictationRepository,
  type DictationSession,
  type SynthesizedAudio,
} from '../domain/dictation.types.js';

const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

export class DictationService {
  constructor(
    private readonly repository: DictationRepository,
    private readonly decks: DeckService,
    private readonly dictionary: DictionaryService,
    private readonly audio: AudioProvider,
  ) {}

  listOwnedDecks(guildId: string, userId: string) {
    return this.decks.listOwned(guildId, userId);
  }

  async getActiveSession(guildId: string, userId: string): Promise<DictationSession | null> {
    return this.repository.findActive(guildId, userId, nowIso());
  }

  async getEligibleQuestions(guildId: string, userId: string, deckId: number): Promise<EligibleQuestion[]> {
    return (await this.loadDeckCandidates(guildId, userId, deckId)).candidates;
  }

  choosePublicQuestions(candidates: EligibleQuestion[], count: number, random: () => number = Math.random) {
    return chooseQuestions(candidates, count, random);
  }

  evaluatePublicAnswer(answer: string, question: Pick<DictationQuestion, 'simplified' | 'traditional'>): boolean {
    return gradeAnswer(answer, question);
  }

  synthesizePublic(text: string): Promise<SynthesizedAudio> {
    return this.audio.synthesize(text, 'normal');
  }

  async start(
    guildId: string,
    userId: string,
    deckId: number,
    count: number,
    channelId: string,
    random: () => number = Math.random,
    mode: DictationMode = 'discord',
  ): Promise<{ session: DictationSession; question: DictationQuestion; audio: SynthesizedAudio }> {
    if (await this.getActiveSession(guildId, userId)) {
      throw new DictationError('Bạn đang có một phiên khảo bài trong server này. Dùng `/khaobai tieptuc` để mở lại.');
    }

    const { deck, candidates } = await this.loadDeckCandidates(guildId, userId, deckId);
    if (![5, 10, 20].includes(count)) throw new DictationError('Số câu phải là 5, 10 hoặc 20.');
    if (count > candidates.length) {
      throw new DictationError(`Bộ này chỉ có ${candidates.length} từ đủ điều kiện; hãy chọn số câu nhỏ hơn.`);
    }
    const questions = chooseQuestions(candidates, count, random);
    const firstAudio = await this.audio.synthesize(questions[0]!.simplified, 'normal');
    const now = nowIso();
    let session: DictationSession;
    try {
      session = await this.repository.createSession({
        id: randomUUID(),
        guildId,
        userId,
        deckId: deck.id,
        deckName: deck.name,
        questionCount: count,
        channelId,
        mode,
        expiresAt: expiresAt(now),
      }, questions, now);
    } catch (error) {
      if (error instanceof Error && /UNIQUE constraint failed/u.test(error.message)) {
        throw new DictationError('Bạn vừa bắt đầu một phiên khảo bài khác. Dùng `/khaobai tieptuc` để tiếp tục.');
      }
      throw error;
    }
    const question = await this.repository.findQuestion(session.id, 0);
    if (!question) throw new Error('First dictation question could not be found.');
    return { session, question, audio: firstAudio };
  }

  async resume(
    guildId: string,
    userId: string,
  ): Promise<{ session: DictationSession; question: DictationQuestion; audio: SynthesizedAudio | null }> {
    const session = await this.getActiveSession(guildId, userId);
    if (!session) throw new DictationError('Bạn không có phiên khảo bài đang hoạt động trong server này.');
    const question = await this.repository.findQuestion(session.id, session.currentIndex);
    if (!question) throw new Error('Current dictation question could not be found.');
    const audio = question.answeredAt ? null : await this.audio.synthesize(question.simplified, 'normal');
    return { session, question, audio };
  }

  async bindMessage(sessionId: string, messageId: string): Promise<void> {
    const now = nowIso();
    if (!await this.repository.bindMessage(sessionId, messageId, now, expiresAt(now))) {
      throw new DictationError('Phiên khảo bài đã hết hạn hoặc không còn hoạt động.');
    }
  }

  async getOwnedSession(
    sessionId: string,
    guildId: string,
    userId: string,
    messageId?: string,
  ): Promise<DictationSession> {
    const session = await this.repository.findSession(sessionId);
    if (!session || session.guildId !== guildId || session.userId !== userId) {
      throw new DictationError('Không tìm thấy phiên khảo bài của bạn trong server này.');
    }
    const now = nowIso();
    if (session.status === 'active' && session.expiresAt <= now) {
      await this.repository.expire(sessionId, now);
      throw new DictationError('Phiên khảo bài đã hết hạn. Hãy dùng `/khaobai batdau` để tạo phiên mới.');
    }
    if (session.status !== 'active') {
      throw new DictationError(session.status === 'expired'
        ? 'Phiên khảo bài đã hết hạn. Hãy dùng `/khaobai batdau` để tạo phiên mới.'
        : 'Phiên khảo bài này đã hoàn tất.');
    }
    if (messageId && session.messageId !== messageId) {
      throw new DictationError('Nút này thuộc giao diện phiên cũ. Hãy dùng `/khaobai tieptuc` để mở phiên hiện tại.');
    }
    return session;
  }

  async getCurrentQuestion(session: DictationSession, expectedIndex = session.currentIndex): Promise<DictationQuestion> {
    if (expectedIndex !== session.currentIndex) throw new DictationError('Câu hỏi này đã cũ; hãy dùng các nút trên câu hiện tại.');
    const question = await this.repository.findQuestion(session.id, expectedIndex);
    if (!question) throw new Error('Current dictation question could not be found.');
    return question;
  }

  async markHint(session: DictationSession, questionIndex: number): Promise<DictationQuestion> {
    const question = await this.getCurrentQuestion(session, questionIndex);
    if (question.answeredAt) throw new DictationError('Câu này đã được trả lời.');
    const now = nowIso();
    if (!await this.repository.markHint(session.id, questionIndex, now, expiresAt(now))) {
      throw new DictationError('Câu hỏi đã thay đổi hoặc phiên khảo bài đã hết hạn.');
    }
    return this.getCurrentQuestion(session, questionIndex);
  }

  async replay(
    session: DictationSession,
    questionIndex: number,
    speed: AudioSpeed,
  ): Promise<{ question: DictationQuestion; audio: SynthesizedAudio }> {
    const question = await this.getCurrentQuestion(session, questionIndex);
    if (question.answeredAt) throw new DictationError('Câu này đã được trả lời.');
    const audio = await this.audio.synthesize(question.simplified, speed);
    const now = nowIso();
    if (!await this.repository.incrementReplay(session.id, questionIndex, now, expiresAt(now))) {
      throw new DictationError('Câu hỏi đã thay đổi hoặc phiên khảo bài đã hết hạn.');
    }
    return { question: await this.getCurrentQuestion(session, questionIndex), audio };
  }

  async submitAnswer(session: DictationSession, questionIndex: number, answer: string): Promise<DictationQuestion> {
    const question = await this.getCurrentQuestion(session, questionIndex);
    if (question.answeredAt) throw new DictationError('Câu này đã được chấm; không thể gửi đáp án lần nữa.');
    const now = nowIso();
    const correct = gradeAnswer(answer, question);
    if (!await this.repository.submitAnswer(
      session.id, questionIndex, answer, correct, now, expiresAt(now),
    )) {
      throw new DictationError('Đáp án đã được nhận hoặc câu hỏi đã thay đổi. Không ghi nhận submit trùng.');
    }
    return this.getCurrentQuestion(session, questionIndex);
  }

  async advance(
    session: DictationSession,
    questionIndex: number,
  ): Promise<{ session: DictationSession; question: DictationQuestion | null; audio: SynthesizedAudio | null }> {
    const current = await this.getCurrentQuestion(session, questionIndex);
    if (session.mode === 'discord' && !current.answeredAt) {
      throw new DictationError('Hãy gửi đáp án câu này trước khi chuyển câu.');
    }
    const isLast = questionIndex + 1 >= session.questionCount;
    const nextQuestion = isLast ? null : await this.repository.findQuestion(session.id, questionIndex + 1);
    if (!isLast && !nextQuestion) throw new Error('Next dictation question could not be found.');
    const audio = nextQuestion ? await this.audio.synthesize(nextQuestion.simplified, 'normal') : null;
    const now = nowIso();
    const updated = await this.repository.advance(session.id, questionIndex, now, expiresAt(now));
    if (!updated) throw new DictationError('Câu hỏi đã được chuyển hoặc phiên khảo bài đã hết hạn.');
    return {
      session: updated,
      question: updated.status === 'active' ? nextQuestion : null,
      audio: updated.status === 'active' ? audio : null,
    };
  }

  async getResults(sessionId: string): Promise<DictationQuestion[]> {
    return this.repository.findQuestions(sessionId);
  }

  async getReadQuestions(session: DictationSession): Promise<DictationQuestion[]> {
    return (await this.repository.findQuestions(session.id)).slice(0, session.currentIndex + 1);
  }

  private async loadDeckCandidates(guildId: string, userId: string, deckId: number) {
    const deck = await this.decks.getVisible(guildId, userId, deckId);
    if (deck.ownerId !== userId) throw new DictationError('Chỉ có thể khảo bài từ bộ từ do chính bạn sở hữu.');
    const firstPage = await this.decks.view(guildId, userId, deckId, 1);
    const entryIds = firstPage.items.map(({ entry }) => entry.id);
    for (let page = 2; page <= firstPage.totalPages; page += 1) {
      entryIds.push(...(await this.decks.view(guildId, userId, deckId, page)).items.map(({ entry }) => entry.id));
    }
    const entries = entryIds.flatMap((id) => {
      const entry = this.dictionary.getById(id);
      return entry ? [entry] : [];
    });
    const candidates = eligibleQuestions(entries);
    if (!candidates.length) {
      throw new DictationError('Bộ này chưa có từ đủ điều kiện để khảo bài (cần chữ Hán và một cách đọc rõ ràng).');
    }
    return { deck, candidates };
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function expiresAt(now: string): string {
  return new Date(Date.parse(now) + SESSION_TTL_MS).toISOString();
}
