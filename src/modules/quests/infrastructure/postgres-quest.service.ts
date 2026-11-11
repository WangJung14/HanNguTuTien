import type { Sql } from 'postgres';
import { vietnamDate, type XpService } from '../../cultivation/application/xp.service.js';
import { QUESTS, type QuestKey } from '../domain/quest.config.js';
import type { QuestProgress, QuestService, Streak } from '../application/quest.service.js';

export class PostgresQuestService implements Pick<QuestService,
  'recordSavedWord' | 'recordCorrectAnswer' | 'recordCompletedSession' | 'recordMeditation' |
  'getDaily' | 'getStreak' | 'activityDays' | 'recordLearningDay'> {
  constructor(private readonly sql: Sql, private readonly xp: XpService) {}

  async recordSavedWord(guildId: string, userId: string, entryId: number, now = new Date()): Promise<void> {
    const date = vietnamDate(now);
    const inserted = await this.sql`
      INSERT INTO daily_quest_entries (guild_id,user_id,activity_date,entry_id,created_at)
      VALUES (${guildId},${userId},${date},${entryId},${now.toISOString()}) ON CONFLICT DO NOTHING
      RETURNING entry_id
    `;
    if (inserted.length) await this.increment(guildId, userId, date, 'collect_words', 1, now.toISOString());
    await this.reconcile(guildId, userId, date, now);
  }

  async recordCorrectAnswer(guildId: string, userId: string, now = new Date()): Promise<void> {
    const date = vietnamDate(now);
    await this.increment(guildId, userId, date, 'correct_dictation', 1, now.toISOString());
    await this.reconcile(guildId, userId, date, now);
  }

  async recordCompletedSession(
    guildId: string, userId: string, sessionId: string, questionCount: number, now = new Date(),
  ): Promise<void> {
    const date = vietnamDate(now);
    if (questionCount >= 10) await this.increment(guildId, userId, date, 'complete_session', 1, now.toISOString());
    await this.recordStreak(guildId, userId, sessionId, date, now.toISOString());
    await this.reconcile(guildId, userId, date, now);
  }

  async recordMeditation(guildId: string, userId: string, minutes: number, now = new Date()): Promise<void> {
    const date = vietnamDate(now);
    await this.increment(guildId, userId, date, 'meditate_minutes', minutes, now.toISOString());
    await this.reconcile(guildId, userId, date, now);
  }
  async recordLearningDay(guildId:string,userId:string,sessionId:string,now=new Date()):Promise<void>{await this.recordStreak(guildId,userId,sessionId,vietnamDate(now),now.toISOString());}

  async getDaily(guildId: string, userId: string, now = new Date()): Promise<QuestProgress[]> {
    const date = vietnamDate(now);
    await this.ensureAll(guildId, userId, date, now.toISOString());
    await this.reconcile(guildId, userId, date, now);
    return this.sql<QuestProgress[]>`
      SELECT quest_key AS "questKey", progress, completed_at AS "completedAt",
        rewarded_at AS "rewardedAt", xp_awarded AS "xpAwarded"
      FROM daily_quest_progress WHERE guild_id=${guildId} AND user_id=${userId} AND activity_date=${date}
      ORDER BY quest_key
    `;
  }

  async getStreak(guildId: string, userId: string): Promise<Streak> {
    const rows = await this.sql<Streak[]>`
      SELECT current_streak AS "currentStreak", longest_streak AS "longestStreak",
        last_active_date AS "lastActiveDate"
      FROM learning_streaks WHERE guild_id=${guildId} AND user_id=${userId}
    `;
    return rows[0] ?? { currentStreak: 0, longestStreak: 0, lastActiveDate: null };
  }

  async activityDays(guildId: string, userId: string): Promise<string[]> {
    const rows = await this.sql<{ date: string }[]>`
      SELECT activity_date AS date FROM learning_activity_days
      WHERE guild_id=${guildId} AND user_id=${userId} ORDER BY activity_date DESC LIMIT 10
    `;
    return rows.map(({ date }) => date);
  }

  private async increment(
    guildId: string, userId: string, date: string, key: QuestKey, amount: number, now: string,
  ): Promise<void> {
    const target = QUESTS[key].target;
    await this.sql`
      INSERT INTO daily_quest_progress (
        guild_id,user_id,activity_date,quest_key,progress,completed_at,updated_at
      ) VALUES (
        ${guildId},${userId},${date},${key},${Math.min(amount, target)},
        ${amount >= target ? now : null},${now}
      )
      ON CONFLICT (guild_id,user_id,activity_date,quest_key) DO UPDATE SET
        progress=LEAST(${target},daily_quest_progress.progress+${amount}),
        completed_at=CASE
          WHEN daily_quest_progress.completed_at IS NULL
            AND daily_quest_progress.progress+${amount}>=${target} THEN ${now}
          ELSE daily_quest_progress.completed_at END,
        updated_at=${now}
    `;
  }

  private async ensureAll(guildId: string, userId: string, date: string, now: string): Promise<void> {
    for (const key of Object.keys(QUESTS) as QuestKey[]) {
      await this.sql`
        INSERT INTO daily_quest_progress (guild_id,user_id,activity_date,quest_key,updated_at)
        VALUES (${guildId},${userId},${date},${key},${now}) ON CONFLICT DO NOTHING
      `;
    }
  }

  private async reconcile(guildId: string, userId: string, date: string, now: Date): Promise<void> {
    await this.ensureAll(guildId, userId, date, now.toISOString());
    const pending = await this.sql<{ questKey: QuestKey }[]>`
      SELECT quest_key AS "questKey" FROM daily_quest_progress
      WHERE guild_id=${guildId} AND user_id=${userId} AND activity_date=${date}
        AND completed_at IS NOT NULL AND rewarded_at IS NULL
    `;
    for (const { questKey } of pending) {
      const config = QUESTS[questKey];
      const meditation = questKey === 'meditate_minutes';
      const award = await this.xp.awardExternal(
        guildId, userId, config.reward, `quest_${questKey}`,
        `quest:${guildId}:${userId}:${date}:${questKey}`,
        {
          now,
          scopedDailyCap: meditation ? 60 : undefined,
          scopedSources: meditation ? ['meditation_tick', 'quest_meditate_minutes'] : undefined,
          maxTotalXp: meditation ? 1750 : undefined,
        },
      );
      await this.sql`
        UPDATE daily_quest_progress SET rewarded_at=${now.toISOString()},xp_awarded=${award.awarded},
          updated_at=${now.toISOString()}
        WHERE guild_id=${guildId} AND user_id=${userId} AND activity_date=${date}
          AND quest_key=${questKey} AND rewarded_at IS NULL
      `;
    }
  }

  private async recordStreak(
    guildId: string, userId: string, sessionId: string, date: string, now: string,
  ): Promise<void> {
    const inserted = await this.sql`
      INSERT INTO learning_activity_days (guild_id,user_id,activity_date,session_id,created_at)
      VALUES (${guildId},${userId},${date},${sessionId},${now}) ON CONFLICT DO NOTHING
      RETURNING session_id
    `;
    if (!inserted.length) return;
    const previousDate = addDays(date, -1);
    await this.sql.begin(async (transaction) => {
      const old = await transaction<Streak[]>`
        SELECT current_streak AS "currentStreak",longest_streak AS "longestStreak",
          last_active_date AS "lastActiveDate"
        FROM learning_streaks WHERE guild_id=${guildId} AND user_id=${userId} FOR UPDATE
      `;
      const current = old[0]?.lastActiveDate === previousDate ? (old[0].currentStreak + 1) : 1;
      await transaction`
        INSERT INTO learning_streaks (
          guild_id,user_id,current_streak,longest_streak,last_active_date,updated_at
        ) VALUES (${guildId},${userId},${current},${current},${date},${now})
        ON CONFLICT (guild_id,user_id) DO UPDATE SET
          current_streak=EXCLUDED.current_streak,
          longest_streak=GREATEST(learning_streaks.longest_streak,EXCLUDED.current_streak),
          last_active_date=EXCLUDED.last_active_date,updated_at=EXCLUDED.updated_at
      `;
    });
  }
}

function addDays(date: string, amount: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}
