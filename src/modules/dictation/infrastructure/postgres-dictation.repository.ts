import type { Sql } from 'postgres';
import type {
  DictationQuestion, DictationRepository, DictationSession, NewDictationQuestion, NewDictationSession,
} from '../domain/dictation.types.js';

type SessionRow = Omit<DictationSession, 'deckId' | 'questionCount' | 'currentIndex'> & {
  deckId: string;
  questionCount: number;
  currentIndex: number;
};
type QuestionRow = Omit<DictationQuestion, 'entryId' | 'isCorrect' | 'usedHint'> & {
  entryId: string;
  isCorrect: number | null;
  usedHint: number;
};

const SESSION_COLUMNS = `
  id, guild_id AS "guildId", user_id AS "userId", deck_id::text AS "deckId",
  deck_name AS "deckName", question_count AS "questionCount",
  current_index AS "currentIndex", status, mode, created_at AS "createdAt",
  updated_at AS "updatedAt", expires_at AS "expiresAt", channel_id AS "channelId",
  message_id AS "messageId"
`;
const QUESTION_COLUMNS = `
  session_id AS "sessionId", question_index AS "questionIndex", entry_id::text AS "entryId",
  simplified, traditional, pinyin, meaning_vi AS "meaningVi", answer,
  is_correct AS "isCorrect", used_hint AS "usedHint", replay_count AS "replayCount",
  answered_at AS "answeredAt"
`;

function mapSession(row: SessionRow | undefined): DictationSession | null {
  if (!row) return null;
  const deckId = Number(row.deckId);
  if (!Number.isSafeInteger(deckId)) throw new Error('PostgreSQL deck ID exceeds the supported safe integer range.');
  return { ...row, deckId };
}

function mapQuestion(row: QuestionRow): DictationQuestion {
  const entryId = Number(row.entryId);
  if (!Number.isSafeInteger(entryId)) {
    throw new Error('PostgreSQL dictionary entry ID exceeds the supported safe integer range.');
  }
  return {
    ...row,
    entryId,
    isCorrect: row.isCorrect === null ? null : row.isCorrect === 1,
    usedHint: row.usedHint === 1,
  };
}

export class PostgresDictationRepository implements DictationRepository {
  constructor(private readonly sql: Sql) {}

  async findActive(guildId: string, userId: string, now: string): Promise<DictationSession | null> {
    await this.sql`
      UPDATE dictation_sessions SET status = 'expired', updated_at = ${now}
      WHERE guild_id = ${guildId} AND user_id = ${userId} AND status = 'active' AND expires_at <= ${now}
    `;
    const rows = await this.sql<SessionRow[]>`
      SELECT ${this.sql.unsafe(SESSION_COLUMNS)} FROM dictation_sessions
      WHERE guild_id = ${guildId} AND user_id = ${userId} AND status = 'active'
    `;
    return mapSession(rows[0]);
  }

  async findSession(sessionId: string): Promise<DictationSession | null> {
    const rows = await this.sql<SessionRow[]>`
      SELECT ${this.sql.unsafe(SESSION_COLUMNS)} FROM dictation_sessions WHERE id = ${sessionId}
    `;
    return mapSession(rows[0]);
  }

  async findQuestion(sessionId: string, questionIndex: number): Promise<DictationQuestion | null> {
    const rows = await this.sql<QuestionRow[]>`
      SELECT ${this.sql.unsafe(QUESTION_COLUMNS)} FROM dictation_results
      WHERE session_id = ${sessionId} AND question_index = ${questionIndex}
    `;
    return rows[0] ? mapQuestion(rows[0]) : null;
  }

  async findQuestions(sessionId: string): Promise<DictationQuestion[]> {
    const rows = await this.sql<QuestionRow[]>`
      SELECT ${this.sql.unsafe(QUESTION_COLUMNS)} FROM dictation_results
      WHERE session_id = ${sessionId} ORDER BY question_index
    `;
    return rows.map(mapQuestion);
  }

  async createSession(
    session: NewDictationSession,
    questions: NewDictationQuestion[],
    now: string,
  ): Promise<DictationSession> {
    await this.sql.begin(async (transaction) => {
      await transaction`
        UPDATE dictation_sessions SET status = 'expired', updated_at = ${now}
        WHERE guild_id = ${session.guildId} AND user_id = ${session.userId}
          AND status = 'active' AND expires_at <= ${now}
      `;
      await transaction`
        INSERT INTO dictation_sessions (
          id, guild_id, user_id, deck_id, deck_name, question_count, current_index,
          status, mode, created_at, updated_at, expires_at, channel_id
        ) VALUES (
          ${session.id}, ${session.guildId}, ${session.userId}, ${session.deckId},
          ${session.deckName}, ${session.questionCount}, 0, 'active', ${session.mode},
          ${now}, ${now}, ${session.expiresAt}, ${session.channelId}
        )
      `;
      for (const [questionIndex, question] of questions.entries()) {
        await transaction`
          INSERT INTO dictation_results (
            session_id, question_index, entry_id, simplified, traditional, pinyin, meaning_vi
          ) VALUES (
            ${session.id}, ${questionIndex}, ${question.entryId}, ${question.simplified},
            ${question.traditional}, ${question.pinyin}, ${question.meaningVi}
          )
        `;
      }
    });
    const created = await this.findSession(session.id);
    if (!created) throw new Error('Created dictation session could not be found.');
    return created;
  }

  async bindMessage(sessionId: string, messageId: string, now: string, expiresAt: string): Promise<boolean> {
    const rows = await this.sql`
      UPDATE dictation_sessions SET message_id = ${messageId}, updated_at = ${now}, expires_at = ${expiresAt}
      WHERE id = ${sessionId} AND status = 'active' AND expires_at > ${now}
      RETURNING id
    `;
    return rows.length === 1;
  }

  async markHint(sessionId: string, questionIndex: number, now: string, expiresAt: string): Promise<boolean> {
    return this.updateQuestionAndRefresh(
      sessionId, questionIndex, now, expiresAt,
      (transaction) => transaction`
        UPDATE dictation_results SET used_hint = 1
        WHERE session_id = ${sessionId} AND question_index = ${questionIndex} AND answer IS NULL
          AND EXISTS (
            SELECT 1 FROM dictation_sessions WHERE id = ${sessionId} AND status = 'active'
              AND current_index = ${questionIndex} AND expires_at > ${now}
          )
        RETURNING session_id
      `,
    );
  }

  async incrementReplay(sessionId: string, questionIndex: number, now: string, expiresAt: string): Promise<boolean> {
    return this.updateQuestionAndRefresh(
      sessionId, questionIndex, now, expiresAt,
      (transaction) => transaction`
        UPDATE dictation_results SET replay_count = replay_count + 1
        WHERE session_id = ${sessionId} AND question_index = ${questionIndex} AND answer IS NULL
          AND EXISTS (
            SELECT 1 FROM dictation_sessions WHERE id = ${sessionId} AND status = 'active'
              AND current_index = ${questionIndex} AND expires_at > ${now}
          )
        RETURNING session_id
      `,
    );
  }

  async submitAnswer(
    sessionId: string, questionIndex: number, answer: string, isCorrect: boolean, now: string, expiresAt: string,
  ): Promise<boolean> {
    return this.updateQuestionAndRefresh(
      sessionId, questionIndex, now, expiresAt,
      (transaction) => transaction`
        UPDATE dictation_results SET answer = ${answer}, is_correct = ${isCorrect ? 1 : 0}, answered_at = ${now}
        WHERE session_id = ${sessionId} AND question_index = ${questionIndex} AND answer IS NULL
          AND EXISTS (
            SELECT 1 FROM dictation_sessions WHERE id = ${sessionId} AND status = 'active'
              AND current_index = ${questionIndex} AND expires_at > ${now}
          )
        RETURNING session_id
      `,
    );
  }

  async advance(
    sessionId: string, questionIndex: number, now: string, expiresAt: string,
  ): Promise<DictationSession | null> {
    const advanced = await this.sql.begin(async (transaction) => {
      const current = await transaction<SessionRow[]>`
        SELECT ${transaction.unsafe(SESSION_COLUMNS)} FROM dictation_sessions
        WHERE id = ${sessionId} AND status = 'active' AND current_index = ${questionIndex}
          AND expires_at > ${now}
        FOR UPDATE
      `;
      const session = mapSession(current[0]);
      if (!session) return false;
      const questions = await transaction<{ answeredAt: string | null }[]>`
        SELECT answered_at AS "answeredAt" FROM dictation_results
        WHERE session_id = ${sessionId} AND question_index = ${questionIndex}
      `;
      if (!questions[0] || (session.mode === 'discord' && !questions[0].answeredAt)) return false;
      const nextIndex = questionIndex + 1;
      const status = nextIndex >= session.questionCount ? 'completed' : 'active';
      await transaction`
        UPDATE dictation_sessions
        SET current_index = ${nextIndex}, status = ${status}, updated_at = ${now}, expires_at = ${expiresAt}
        WHERE id = ${sessionId}
      `;
      return true;
    });
    return advanced ? this.findSession(sessionId) : null;
  }

  async expire(sessionId: string, now: string): Promise<void> {
    await this.sql`
      UPDATE dictation_sessions SET status = 'expired', updated_at = ${now}
      WHERE id = ${sessionId} AND status = 'active'
    `;
  }

  private async updateQuestionAndRefresh(
    sessionId: string,
    questionIndex: number,
    now: string,
    expiresAt: string,
    update: (transaction: Sql) => Promise<{ length: number }>,
  ): Promise<boolean> {
    return this.sql.begin(async (transaction) => {
      const sessions = await transaction`
        SELECT id FROM dictation_sessions
        WHERE id=${sessionId} AND status='active' AND current_index=${questionIndex} AND expires_at>${now}
        FOR UPDATE
      `;
      if (!sessions.length) return false;
      const changed = await update(transaction);
      if (changed.length !== 1) return false;
      const refreshed = await transaction`
        UPDATE dictation_sessions SET updated_at = ${now}, expires_at = ${expiresAt}
        WHERE id = ${sessionId} AND status = 'active' AND current_index = ${questionIndex}
          AND expires_at > ${now}
        RETURNING id
      `;
      return refreshed.length === 1;
    });
  }
}
