import type { Sql } from 'postgres';
import { REALMS } from '../domain/cultivation.config.js';
import type {
  AdminXpAction, AdminXpAdjustment, BreakthroughAttempt, CultivationProfile, CultivationRepository, XpAward, XpLedgerEntry,
} from '../domain/cultivation.types.js';

type ProfileRow = Omit<CultivationProfile, 'roleSyncPending'> & { roleSyncPending: number };
type AttemptRow = Omit<BreakthroughAttempt, 'questions'> & { questionsJson: string };
type LedgerRow = Omit<XpLedgerEntry, 'id'> & { id: string };

const PROFILE_COLUMNS = `guild_id AS "guildId", user_id AS "userId", total_xp AS "totalXp",
  major_index AS "majorIndex", role_sync_pending AS "roleSyncPending",
  created_at AS "createdAt", updated_at AS "updatedAt"`;
const ATTEMPT_COLUMNS = `id, guild_id AS "guildId", user_id AS "userId",
  from_major AS "fromMajor", to_major AS "toMajor", deck_id AS "deckId", status,
  current_index AS "currentIndex", correct_count AS "correctCount", questions_json AS "questionsJson",
  cooldown_until AS "cooldownUntil", message_id AS "messageId", created_at AS "createdAt",
  updated_at AS "updatedAt", completed_at AS "completedAt"`;

function mapProfile(row: ProfileRow): CultivationProfile {
  return { ...row, roleSyncPending: row.roleSyncPending === 1 };
}
function mapAttempt(row: AttemptRow | undefined): BreakthroughAttempt | null {
  if (!row) return null;
  const { questionsJson, ...attempt } = row;
  return { ...attempt, questions: JSON.parse(questionsJson) as BreakthroughAttempt['questions'] };
}
function safeInteger(value: string, label: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new Error(`PostgreSQL ${label} exceeds the supported safe integer range.`);
  return result;
}

export class PostgresCultivationRepository implements CultivationRepository {
  constructor(private readonly sql: Sql) {}

  async getOrCreateProfile(guildId: string, userId: string, now: string): Promise<CultivationProfile> {
    await this.sql`
      INSERT INTO cultivation_profiles (guild_id, user_id, created_at, updated_at)
      VALUES (${guildId}, ${userId}, ${now}, ${now}) ON CONFLICT DO NOTHING
    `;
    const rows = await this.sql<ProfileRow[]>`
      SELECT ${this.sql.unsafe(PROFILE_COLUMNS)} FROM cultivation_profiles
      WHERE guild_id = ${guildId} AND user_id = ${userId}
    `;
    if (!rows[0]) throw new Error('Cultivation profile could not be created.');
    return mapProfile(rows[0]);
  }

  async addXp(
    guildId: string, userId: string, amount: number, source: string, rewardKey: string,
    sessionId: string | null, earnedDate: string, now: string, dailyCap: number,
    limits?: { scopedDailyCap?: number; scopedSources?: string[]; maxTotalXp?: number },
  ): Promise<XpAward> {
    return this.sql.begin(async (transaction) => {
      await transaction`
        INSERT INTO cultivation_profiles (guild_id, user_id, created_at, updated_at)
        VALUES (${guildId}, ${userId}, ${now}, ${now}) ON CONFLICT DO NOTHING
      `;
      const profiles = await transaction<ProfileRow[]>`
        SELECT ${transaction.unsafe(PROFILE_COLUMNS)} FROM cultivation_profiles
        WHERE guild_id = ${guildId} AND user_id = ${userId} FOR UPDATE
      `;
      const current = profiles[0];
      if (!current) throw new Error('Cultivation profile could not be locked.');

      const duplicate = await transaction`SELECT 1 FROM xp_ledger WHERE reward_key = ${rewardKey}`;
      if (duplicate.length) return { awarded: 0, duplicate: true, capped: false, totalXp: current.totalXp };

      const dailyRows = await transaction<{ total: number }[]>`
        SELECT COALESCE(SUM(amount), 0)::int AS total FROM xp_ledger
        WHERE guild_id = ${guildId} AND user_id = ${userId} AND earned_date = ${earnedDate}
      `;
      let available = dailyCap - (dailyRows[0]?.total ?? 0);
      if (limits?.scopedDailyCap !== undefined && limits.scopedSources?.length) {
        const scopedRows = await transaction<{ total: number }[]>`
          SELECT COALESCE(SUM(amount), 0)::int AS total FROM xp_ledger
          WHERE guild_id = ${guildId} AND user_id = ${userId} AND earned_date = ${earnedDate}
            AND source IN ${transaction(limits.scopedSources)}
        `;
        available = Math.min(available, limits.scopedDailyCap - (scopedRows[0]?.total ?? 0));
      }
      if (limits?.maxTotalXp !== undefined) available = Math.min(available, limits.maxTotalXp - current.totalXp);
      const awarded = Math.max(0, Math.min(amount, available));
      await transaction`
        INSERT INTO xp_ledger (guild_id, user_id, amount, source, reward_key, session_id, earned_date, created_at)
        VALUES (${guildId}, ${userId}, ${awarded}, ${source}, ${rewardKey}, ${sessionId}, ${earnedDate}, ${now})
      `;
      if (!awarded) return { awarded: 0, duplicate: false, capped: true, totalXp: current.totalXp };
      await transaction`
        UPDATE cultivation_profiles SET total_xp = total_xp + ${awarded}, updated_at = ${now}
        WHERE guild_id = ${guildId} AND user_id = ${userId}
      `;
      return { awarded, duplicate: false, capped: awarded < amount, totalXp: current.totalXp + awarded };
    });
  }

  async listLedger(guildId: string, userId: string, limit: number): Promise<XpLedgerEntry[]> {
    const rows = await this.sql<LedgerRow[]>`
      SELECT id::text AS id, guild_id AS "guildId", user_id AS "userId", amount,
        source, reward_key AS "rewardKey", session_id AS "sessionId",
        earned_date AS "earnedDate", created_at AS "createdAt"
      FROM xp_ledger WHERE guild_id = ${guildId} AND user_id = ${userId}
      ORDER BY id DESC LIMIT ${limit}
    `;
    return rows.map(({ id, ...row }) => ({ ...row, id: safeInteger(id, 'ledger ID') }));
  }

  async getAttempt(id: string): Promise<BreakthroughAttempt | null> {
    const rows = await this.sql<AttemptRow[]>`
      SELECT ${this.sql.unsafe(ATTEMPT_COLUMNS)} FROM breakthrough_attempts WHERE id = ${id}
    `;
    return mapAttempt(rows[0]);
  }

  async findActiveAttempt(guildId: string, userId: string): Promise<BreakthroughAttempt | null> {
    const rows = await this.sql<AttemptRow[]>`
      SELECT ${this.sql.unsafe(ATTEMPT_COLUMNS)} FROM breakthrough_attempts
      WHERE guild_id = ${guildId} AND user_id = ${userId} AND status = 'active'
    `;
    return mapAttempt(rows[0]);
  }

  async latestFailedAttempt(guildId: string, userId: string): Promise<BreakthroughAttempt | null> {
    const rows = await this.sql<AttemptRow[]>`
      SELECT ${this.sql.unsafe(ATTEMPT_COLUMNS)} FROM breakthrough_attempts
      WHERE guild_id = ${guildId} AND user_id = ${userId} AND status = 'failed'
      ORDER BY completed_at DESC LIMIT 1
    `;
    return mapAttempt(rows[0]);
  }

  async createAttempt(value: BreakthroughAttempt): Promise<void> {
    await this.sql`
      INSERT INTO breakthrough_attempts (
        id, guild_id, user_id, from_major, to_major, deck_id, status, current_index,
        correct_count, questions_json, cooldown_until, message_id, created_at, updated_at, completed_at
      ) VALUES (
        ${value.id}, ${value.guildId}, ${value.userId}, ${value.fromMajor}, ${value.toMajor},
        ${value.deckId}, ${value.status}, ${value.currentIndex}, ${value.correctCount},
        ${JSON.stringify(value.questions)}, ${value.cooldownUntil}, ${value.messageId},
        ${value.createdAt}, ${value.updatedAt}, ${value.completedAt}
      )
    `;
  }

  async bindAttemptMessage(id: string, messageId: string, now: string): Promise<boolean> {
    const rows = await this.sql`
      UPDATE breakthrough_attempts SET message_id = ${messageId}, updated_at = ${now}
      WHERE id = ${id} AND status = 'active' RETURNING id
    `;
    return rows.length === 1;
  }

  async answerAttempt(
    id: string, index: number, answerText: string, correct: boolean, now: string,
  ): Promise<BreakthroughAttempt | null> {
    const rows = await this.sql`
      UPDATE breakthrough_attempts
      SET questions_json = jsonb_set(questions_json::jsonb, ARRAY[${index}::text],
            (questions_json::jsonb -> ${index}) || ${JSON.stringify({ answer: answerText, correct })}::jsonb)::text,
          correct_count = correct_count + ${correct ? 1 : 0}, updated_at = ${now}
      WHERE id = ${id} AND status = 'active' AND current_index = ${index}
        AND questions_json::jsonb -> ${index} -> 'answer' = 'null'::jsonb
      RETURNING id
    `;
    return rows.length ? this.getAttempt(id) : null;
  }

  async advanceAttempt(id: string, index: number, now: string, cooldownUntil: string): Promise<BreakthroughAttempt | null> {
    return this.sql.begin(async (transaction) => {
      const rows = await transaction<AttemptRow[]>`
        SELECT ${transaction.unsafe(ATTEMPT_COLUMNS)} FROM breakthrough_attempts
        WHERE id = ${id} AND status = 'active' AND current_index = ${index} FOR UPDATE
      `;
      const current = mapAttempt(rows[0]);
      if (!current || current.questions[index]?.answer === null) return null;
      const last = index + 1 >= current.questions.length;
      const passed = last && current.correctCount >= 8;
      if (passed) {
        const promoted = await transaction`
          UPDATE cultivation_profiles SET major_index = ${current.toMajor}, role_sync_pending = 1, updated_at = ${now}
          WHERE guild_id = ${current.guildId} AND user_id = ${current.userId} AND major_index = ${current.fromMajor}
          RETURNING user_id
        `;
        if (!promoted.length) return null;
      }
      const updated = await transaction`
        UPDATE breakthrough_attempts SET current_index = ${index + 1},
          status = ${last ? (passed ? 'passed' : 'failed') : 'active'},
          cooldown_until = ${last && !passed ? cooldownUntil : null},
          updated_at = ${now}, completed_at = ${last ? now : null}
        WHERE id = ${id} AND status = 'active' AND current_index = ${index} RETURNING id
      `;
      if (!updated.length) return null;
      const fresh = await transaction<AttemptRow[]>`
        SELECT ${transaction.unsafe(ATTEMPT_COLUMNS)} FROM breakthrough_attempts WHERE id = ${id}
      `;
      return mapAttempt(fresh[0]);
    });
  }

  async promote(guildId: string, userId: string, expectedMajor: number, newMajor: number, now: string): Promise<boolean> {
    const rows = await this.sql`
      UPDATE cultivation_profiles SET major_index = ${newMajor}, role_sync_pending = 1, updated_at = ${now}
      WHERE guild_id = ${guildId} AND user_id = ${userId} AND major_index = ${expectedMajor} RETURNING user_id
    `;
    return rows.length === 1;
  }

  async setRoleSyncPending(guildId: string, userId: string, pending: boolean, now: string): Promise<void> {
    await this.sql.begin(async (transaction) => {
      await transaction`
        INSERT INTO cultivation_profiles (guild_id, user_id, created_at, updated_at)
        VALUES (${guildId}, ${userId}, ${now}, ${now}) ON CONFLICT DO NOTHING
      `;
      await transaction`
        UPDATE cultivation_profiles SET role_sync_pending = ${pending ? 1 : 0}, updated_at = ${now}
        WHERE guild_id = ${guildId} AND user_id = ${userId}
      `;
    });
  }

  async setRealmRole(guildId: string, majorIndex: number, roleId: string, now: string): Promise<void> {
    await this.sql`
      INSERT INTO guild_realm_roles (guild_id, major_index, role_id, updated_at)
      VALUES (${guildId}, ${majorIndex}, ${roleId}, ${now})
      ON CONFLICT (guild_id, major_index) DO UPDATE SET role_id = EXCLUDED.role_id, updated_at = EXCLUDED.updated_at
    `;
  }

  async removeRealmRole(guildId: string, majorIndex: number): Promise<void> {
    await this.sql`DELETE FROM guild_realm_roles WHERE guild_id = ${guildId} AND major_index = ${majorIndex}`;
  }

  async getRealmRoles(guildId: string): Promise<Map<number, string>> {
    const rows = await this.sql<{ majorIndex: number; roleId: string }[]>`
      SELECT major_index AS "majorIndex", role_id AS "roleId"
      FROM guild_realm_roles WHERE guild_id = ${guildId}
    `;
    return new Map(rows.map((row) => [row.majorIndex, row.roleId]));
  }

  async getXpAnnouncementChannel(guildId: string): Promise<string | null> {
    const rows = await this.sql<{ channelId: string }[]>`
      SELECT channel_id AS "channelId" FROM xp_announcement_channels WHERE guild_id = ${guildId}
    `;
    return rows[0]?.channelId ?? null;
  }

  async setXpAnnouncementChannel(guildId: string, channelId: string | null, now: string): Promise<void> {
    if (channelId === null) {
      await this.sql`DELETE FROM xp_announcement_channels WHERE guild_id = ${guildId}`;
      return;
    }
    await this.sql`
      INSERT INTO xp_announcement_channels (guild_id,channel_id,updated_at)
      VALUES (${guildId},${channelId},${now})
      ON CONFLICT (guild_id) DO UPDATE SET channel_id=EXCLUDED.channel_id,updated_at=EXCLUDED.updated_at
    `;
  }

  async adjustXpAsAdmin(guildId: string, userId: string, actorId: string, adjustmentId: string,
    action: AdminXpAction, amount: number, reason: string, now: string): Promise<AdminXpAdjustment> {
    return this.sql.begin(async (transaction) => {
      await transaction`
        INSERT INTO cultivation_profiles (guild_id,user_id,created_at,updated_at)
        VALUES (${guildId},${userId},${now},${now}) ON CONFLICT DO NOTHING
      `;
      const profiles = await transaction<ProfileRow[]>`
        SELECT ${transaction.unsafe(PROFILE_COLUMNS)} FROM cultivation_profiles
        WHERE guild_id=${guildId} AND user_id=${userId} FOR UPDATE
      `;
      const current = profiles[0];
      if (!current) throw new Error('Cultivation profile could not be locked for admin XP adjustment.');

      const duplicates = await transaction<AdminXpAdjustment[]>`
        SELECT id,guild_id AS "guildId",user_id AS "userId",actor_id AS "actorId",action,amount,reason,
          previous_total_xp AS "previousTotalXp",new_total_xp AS "newTotalXp",
          previous_major_index AS "previousMajorIndex",new_major_index AS "newMajorIndex",created_at AS "createdAt"
        FROM xp_admin_adjustments WHERE id=${adjustmentId}
      `;
      if (duplicates[0]) return { ...duplicates[0], duplicate: true };

      const newTotalXp = action === 'reward' ? current.totalXp + amount : Math.max(0, current.totalXp - amount);
      let newMajorIndex = current.majorIndex;
      if (action === 'penalty') {
        while (newMajorIndex > 0 && newTotalXp < REALMS[newMajorIndex]!.minXp) newMajorIndex -= 1;
      }
      const actualAmount = action === 'reward' ? amount : current.totalXp - newTotalXp;
      await transaction`
        UPDATE cultivation_profiles
        SET total_xp=${newTotalXp},major_index=${newMajorIndex},
          role_sync_pending=${newMajorIndex !== current.majorIndex ? 1 : current.roleSyncPending},
          updated_at=${now}
        WHERE guild_id=${guildId} AND user_id=${userId}
      `;
      const rows = await transaction<AdminXpAdjustment[]>`
        INSERT INTO xp_admin_adjustments
          (id,guild_id,user_id,actor_id,action,amount,reason,previous_total_xp,new_total_xp,
           previous_major_index,new_major_index,created_at)
        VALUES (${adjustmentId},${guildId},${userId},${actorId},${action},${actualAmount},${reason},
          ${current.totalXp},${newTotalXp},${current.majorIndex},${newMajorIndex},${now})
        RETURNING id,guild_id AS "guildId",user_id AS "userId",actor_id AS "actorId",action,amount,reason,
          previous_total_xp AS "previousTotalXp",new_total_xp AS "newTotalXp",
          previous_major_index AS "previousMajorIndex",new_major_index AS "newMajorIndex",created_at AS "createdAt"
      `;
      if (!rows[0]) throw new Error('Admin XP adjustment was not persisted.');
      return { ...rows[0], duplicate: false };
    });
  }

  async listAttempts(guildId: string, userId: string, limit: number): Promise<BreakthroughAttempt[]> {
    const rows = await this.sql<AttemptRow[]>`
      SELECT ${this.sql.unsafe(ATTEMPT_COLUMNS)} FROM breakthrough_attempts
      WHERE guild_id = ${guildId} AND user_id = ${userId} ORDER BY created_at DESC LIMIT ${limit}
    `;
    return rows.map((row) => mapAttempt(row)!);
  }
}
