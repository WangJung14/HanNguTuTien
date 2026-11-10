import type Database from 'better-sqlite3';
import type {
  DictationQuestion,
  DictationRepository,
  DictationSession,
  NewDictationQuestion,
  NewDictationSession,
} from '../domain/dictation.types.js';

type DbSession = Omit<DictationSession, 'status'> & { status: DictationSession['status'] };
type DbQuestion = Omit<DictationQuestion, 'isCorrect' | 'usedHint'> & {
  isCorrect: number | null;
  usedHint: number;
};

const SESSION_SELECT = `
  SELECT id, guild_id AS guildId, user_id AS userId, deck_id AS deckId,
         deck_name AS deckName, question_count AS questionCount,
         current_index AS currentIndex, status, created_at AS createdAt,
         mode,
         updated_at AS updatedAt, expires_at AS expiresAt,
         channel_id AS channelId, message_id AS messageId
  FROM dictation_sessions
`;

const QUESTION_SELECT = `
  SELECT session_id AS sessionId, question_index AS questionIndex,
         entry_id AS entryId, simplified, traditional, pinyin,
         meaning_vi AS meaningVi, answer, is_correct AS isCorrect,
         used_hint AS usedHint, replay_count AS replayCount,
         answered_at AS answeredAt
  FROM dictation_results
`;

function mapQuestion(row: DbQuestion): DictationQuestion {
  return {
    ...row,
    isCorrect: row.isCorrect === null ? null : row.isCorrect === 1,
    usedHint: row.usedHint === 1,
  };
}

export class SqliteDictationRepository implements DictationRepository {
  constructor(private readonly sqlite: Database.Database) {}

  findActive(guildId: string, userId: string, now: string): DictationSession | null {
    this.sqlite.prepare(`
      UPDATE dictation_sessions SET status = 'expired', updated_at = ?
      WHERE guild_id = ? AND user_id = ? AND status = 'active' AND expires_at <= ?
    `).run(now, guildId, userId, now);
    const row = this.sqlite.prepare(`${SESSION_SELECT}
      WHERE guild_id = ? AND user_id = ? AND status = 'active'
    `).get(guildId, userId) as DbSession | undefined;
    return row ?? null;
  }

  findSession(sessionId: string): DictationSession | null {
    const row = this.sqlite.prepare(`${SESSION_SELECT} WHERE id = ?`).get(sessionId) as DbSession | undefined;
    return row ?? null;
  }

  findQuestion(sessionId: string, questionIndex: number): DictationQuestion | null {
    const row = this.sqlite.prepare(`${QUESTION_SELECT}
      WHERE session_id = ? AND question_index = ?
    `).get(sessionId, questionIndex) as DbQuestion | undefined;
    return row ? mapQuestion(row) : null;
  }

  findQuestions(sessionId: string): DictationQuestion[] {
    const rows = this.sqlite.prepare(`${QUESTION_SELECT}
      WHERE session_id = ? ORDER BY question_index
    `).all(sessionId) as DbQuestion[];
    return rows.map(mapQuestion);
  }

  createSession(
    session: NewDictationSession,
    questions: NewDictationQuestion[],
    now: string,
  ): DictationSession {
    return this.sqlite.transaction(() => {
      this.sqlite.prepare(`
        UPDATE dictation_sessions SET status = 'expired', updated_at = ?
        WHERE guild_id = ? AND user_id = ? AND status = 'active' AND expires_at <= ?
      `).run(now, session.guildId, session.userId, now);
      this.sqlite.prepare(`
        INSERT INTO dictation_sessions (
          id, guild_id, user_id, deck_id, deck_name, question_count,
          current_index, status, created_at, updated_at, expires_at, channel_id, mode
        ) VALUES (?, ?, ?, ?, ?, ?, 0, 'active', ?, ?, ?, ?, ?)
      `).run(
        session.id, session.guildId, session.userId, session.deckId, session.deckName,
        session.questionCount, now, now, session.expiresAt, session.channelId, session.mode,
      );
      const insertQuestion = this.sqlite.prepare(`
        INSERT INTO dictation_results (
          session_id, question_index, entry_id, simplified, traditional, pinyin, meaning_vi
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      questions.forEach((question, questionIndex) => {
        insertQuestion.run(
          session.id, questionIndex, question.entryId, question.simplified,
          question.traditional, question.pinyin, question.meaningVi,
        );
      });
      const created = this.findSession(session.id);
      if (!created) throw new Error('Created dictation session could not be found.');
      return created;
    })();
  }

  bindMessage(sessionId: string, messageId: string, now: string, expiresAt: string): boolean {
    return this.sqlite.prepare(`
      UPDATE dictation_sessions SET message_id = ?, updated_at = ?, expires_at = ?
      WHERE id = ? AND status = 'active' AND expires_at > ?
    `).run(messageId, now, expiresAt, sessionId, now).changes === 1;
  }

  markHint(sessionId: string, questionIndex: number, now: string, expiresAt: string): boolean {
    return this.sqlite.transaction(() => {
      const changed = this.sqlite.prepare(`
        UPDATE dictation_results SET used_hint = 1
        WHERE session_id = ? AND question_index = ?
          AND answer IS NULL
          AND EXISTS (
            SELECT 1 FROM dictation_sessions
            WHERE id = ? AND status = 'active' AND current_index = ? AND expires_at > ?
          )
      `).run(sessionId, questionIndex, sessionId, questionIndex, now).changes === 1;
      if (changed) this.refreshSession(sessionId, now, expiresAt);
      return changed;
    })();
  }

  incrementReplay(sessionId: string, questionIndex: number, now: string, expiresAt: string): boolean {
    return this.sqlite.transaction(() => {
      const changed = this.sqlite.prepare(`
        UPDATE dictation_results SET replay_count = replay_count + 1
        WHERE session_id = ? AND question_index = ? AND answer IS NULL
          AND EXISTS (
            SELECT 1 FROM dictation_sessions
            WHERE id = ? AND status = 'active' AND current_index = ? AND expires_at > ?
          )
      `).run(sessionId, questionIndex, sessionId, questionIndex, now).changes === 1;
      if (changed) this.refreshSession(sessionId, now, expiresAt);
      return changed;
    })();
  }

  submitAnswer(
    sessionId: string,
    questionIndex: number,
    answer: string,
    isCorrect: boolean,
    now: string,
    expiresAt: string,
  ): boolean {
    return this.sqlite.transaction(() => {
      const changed = this.sqlite.prepare(`
        UPDATE dictation_results
        SET answer = ?, is_correct = ?, answered_at = ?
        WHERE session_id = ? AND question_index = ? AND answer IS NULL
          AND EXISTS (
            SELECT 1 FROM dictation_sessions
            WHERE id = ? AND status = 'active' AND current_index = ? AND expires_at > ?
          )
      `).run(answer, isCorrect ? 1 : 0, now, sessionId, questionIndex, sessionId, questionIndex, now)
        .changes === 1;
      if (changed) this.refreshSession(sessionId, now, expiresAt);
      return changed;
    })();
  }

  advance(sessionId: string, questionIndex: number, now: string, expiresAt: string): DictationSession | null {
    return this.sqlite.transaction(() => {
      const session = this.findSession(sessionId);
      if (!session || session.status !== 'active' || session.currentIndex !== questionIndex || session.expiresAt <= now) {
        return null;
      }
      const question = this.findQuestion(sessionId, questionIndex);
      if (!question || (session.mode === 'discord' && !question.answeredAt)) return null;
      const nextIndex = questionIndex + 1;
      const status = nextIndex >= session.questionCount ? 'completed' : 'active';
      const changed = this.sqlite.prepare(`
        UPDATE dictation_sessions
        SET current_index = ?, status = ?, updated_at = ?, expires_at = ?
        WHERE id = ? AND status = 'active' AND current_index = ? AND expires_at > ?
      `).run(nextIndex, status, now, expiresAt, sessionId, questionIndex, now).changes === 1;
      return changed ? this.findSession(sessionId) : null;
    })();
  }

  expire(sessionId: string, now: string): void {
    this.sqlite.prepare(`
      UPDATE dictation_sessions SET status = 'expired', updated_at = ?
      WHERE id = ? AND status = 'active' AND expires_at <= ?
    `).run(now, sessionId, now);
  }

  private refreshSession(sessionId: string, now: string, expiresAt: string): void {
    this.sqlite.prepare(`
      UPDATE dictation_sessions SET updated_at = ?, expires_at = ?
      WHERE id = ? AND status = 'active'
    `).run(now, expiresAt, sessionId);
  }
}
