import { randomUUID } from 'node:crypto';
import type { Sql } from 'postgres';
import { vietnamDate, type XpService } from '../../cultivation/application/xp.service.js';
import type { QuestService } from '../../quests/application/quest.service.js';
import { MEDITATION_CONFIG, MEDITATION_SOURCES } from '../domain/meditation.config.js';
import type { MeditationService } from '../application/meditation.service.js';

type Session = {
  id: string; guildId: string; userId: string; channelId: string;
  startedAt: string; nextRewardAt: string; tickIndex: number;
};

export class PostgresMeditationService implements Pick<MeditationService,
  'setChannel' | 'getChannel' | 'start' | 'end' | 'endAll' | 'endGuild' | 'processDue' | 'status'> {
  constructor(private readonly sql: Sql, private readonly xp: XpService, private readonly quests: Pick<QuestService, 'recordMeditation'>) {}

  async setChannel(guildId: string, channelId: string | null, now = new Date()): Promise<void> {
    await this.sql.begin(async (transaction) => {
      await transaction`
        UPDATE meditation_sessions SET status='ended',ended_at=${now.toISOString()},updated_at=${now.toISOString()}
        WHERE guild_id=${guildId} AND status='active'
      `;
      await transaction`
        INSERT INTO meditation_config (guild_id,channel_id,updated_at)
        VALUES (${guildId},${channelId},${now.toISOString()})
        ON CONFLICT (guild_id) DO UPDATE SET channel_id=EXCLUDED.channel_id,updated_at=EXCLUDED.updated_at
      `;
    });
  }

  async getChannel(guildId: string): Promise<string | null> {
    const rows = await this.sql<{ channelId: string | null }[]>`
      SELECT channel_id AS "channelId" FROM meditation_config WHERE guild_id=${guildId}
    `;
    return rows[0]?.channelId ?? null;
  }

  async start(guildId: string, userId: string, channelId: string, now = new Date()): Promise<boolean> {
    const configured = await this.getChannel(guildId);
    if (configured !== channelId) return false;
    const iso = now.toISOString();
    const next = new Date(now.getTime() + MEDITATION_CONFIG.intervalMinutes * 60_000).toISOString();
    await this.sql.begin(async (transaction) => {
      await transaction`
        UPDATE meditation_sessions SET status='ended',ended_at=${iso},updated_at=${iso}
        WHERE guild_id=${guildId} AND user_id=${userId} AND status='active'
      `;
      await transaction`
        INSERT INTO meditation_sessions (
          id,guild_id,user_id,channel_id,status,started_at,next_reward_at,updated_at
        ) VALUES (${randomUUID()},${guildId},${userId},${channelId},'active',${iso},${next},${iso})
      `;
    });
    return true;
  }

  async end(guildId: string, userId: string, now = new Date()): Promise<void> {
    await this.sql`
      UPDATE meditation_sessions SET status='ended',ended_at=${now.toISOString()},updated_at=${now.toISOString()}
      WHERE guild_id=${guildId} AND user_id=${userId} AND status='active'
    `;
  }

  async endAll(now = new Date()): Promise<void> {
    await this.sql`
      UPDATE meditation_sessions SET status='ended',ended_at=${now.toISOString()},updated_at=${now.toISOString()}
      WHERE status='active'
    `;
  }

  async endGuild(guildId: string, now = new Date()): Promise<void> {
    await this.sql`
      UPDATE meditation_sessions SET status='ended',ended_at=${now.toISOString()},updated_at=${now.toISOString()}
      WHERE guild_id=${guildId} AND status='active'
    `;
  }

  async processDue(now = new Date()): Promise<number> {
    const rows = await this.sql<Session[]>`
      SELECT id,guild_id AS "guildId",user_id AS "userId",channel_id AS "channelId",
        started_at AS "startedAt",next_reward_at AS "nextRewardAt",tick_index AS "tickIndex"
      FROM meditation_sessions WHERE status='active' AND next_reward_at<=${now.toISOString()}
    `;
    let processed = 0;
    for (const initial of rows) {
      let session = initial;
      while (session.nextRewardAt <= now.toISOString()) {
        const tick = session.tickIndex + 1;
        const tickTime = new Date(session.nextRewardAt);
        const date = vietnamDate(tickTime);
        const award = await this.xp.awardExternal(
          session.guildId, session.userId, MEDITATION_CONFIG.xpPerInterval,
          'meditation_tick', `meditation:${session.id}:${tick}`,
          {
            sessionId: session.id, now: tickTime,
            scopedDailyCap: MEDITATION_CONFIG.dailyXpCap,
            scopedSources: [...MEDITATION_SOURCES], maxTotalXp: MEDITATION_CONFIG.maxTotalXp,
          },
        );
        const inserted = await this.sql`
          INSERT INTO meditation_rewards (
            session_id,tick_index,guild_id,user_id,activity_date,minutes,xp_awarded,created_at
          ) VALUES (
            ${session.id},${tick},${session.guildId},${session.userId},${date},
            ${MEDITATION_CONFIG.intervalMinutes},${award.awarded},${tickTime.toISOString()}
          ) ON CONFLICT DO NOTHING RETURNING tick_index
        `;
        if (!inserted.length) break;
        const next = new Date(tickTime.getTime() + MEDITATION_CONFIG.intervalMinutes * 60_000).toISOString();
        await this.sql`
          UPDATE meditation_sessions SET tick_index=${tick},next_reward_at=${next},updated_at=${now.toISOString()}
          WHERE id=${session.id} AND status='active' AND tick_index<${tick}
        `;
        await this.quests.recordMeditation(
          session.guildId, session.userId, MEDITATION_CONFIG.intervalMinutes, tickTime,
        );
        processed += 1;
        session = { ...session, tickIndex: tick, nextRewardAt: next };
      }
    }
    return processed;
  }

  async status(guildId: string, userId: string, now = new Date()) {
    const date = vietnamDate(now);
    const [minuteRows, xpRows, activeRows, channelId] = await Promise.all([
      this.sql<{ value: number }[]>`
        SELECT COALESCE(SUM(minutes),0)::int AS value FROM meditation_rewards
        WHERE guild_id=${guildId} AND user_id=${userId} AND activity_date=${date}
      `,
      this.sql<{ value: number }[]>`
        SELECT COALESCE(SUM(amount),0)::int AS value FROM xp_ledger
        WHERE guild_id=${guildId} AND user_id=${userId} AND earned_date=${date}
          AND source IN ('meditation_tick','quest_meditate_minutes')
      `,
      this.sql<{ channelId: string; startedAt: string; nextRewardAt: string }[]>`
        SELECT channel_id AS "channelId",started_at AS "startedAt",next_reward_at AS "nextRewardAt"
        FROM meditation_sessions WHERE guild_id=${guildId} AND user_id=${userId} AND status='active'
      `,
      this.getChannel(guildId),
    ]);
    const minutes = minuteRows[0]?.value ?? 0;
    const xp = xpRows[0]?.value ?? 0;
    return {
      minutes, xp, active: activeRows[0] ?? null,
      remainingXp: Math.max(0, MEDITATION_CONFIG.dailyXpCap - xp), channelId,
    };
  }
}
