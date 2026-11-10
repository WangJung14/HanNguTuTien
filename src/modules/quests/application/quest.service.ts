import type Database from 'better-sqlite3';
import { vietnamDate, type XpService } from '../../cultivation/application/xp.service.js';
import { QUESTS, type QuestKey } from '../domain/quest.config.js';

export type QuestProgress = { questKey: QuestKey; progress: number; completedAt: string | null; rewardedAt: string | null; xpAwarded: number };
export type Streak = { currentStreak: number; longestStreak: number; lastActiveDate: string | null };

export class QuestService {
  constructor(private readonly sqlite: Database.Database, private readonly xp: XpService) {}

  async recordSavedWord(guildId: string, userId: string, entryId: number, now = new Date()): Promise<void> {
    const date = vietnamDate(now); const iso = now.toISOString();
    const inserted = this.sqlite.prepare(`INSERT OR IGNORE INTO daily_quest_entries
      (guild_id,user_id,activity_date,entry_id,created_at) VALUES (?,?,?,?,?)`).run(guildId,userId,date,entryId,iso).changes;
    if (inserted) await this.increment(guildId,userId,date,'collect_words',1,iso);
    await this.reconcile(guildId,userId,date,now);
  }
  async recordCorrectAnswer(guildId: string, userId: string, now = new Date()): Promise<void> {
    const date = vietnamDate(now); await this.increment(guildId,userId,date,'correct_dictation',1,now.toISOString());
    await this.reconcile(guildId,userId,date,now);
  }
  async recordCompletedSession(guildId: string, userId: string, sessionId: string, questionCount: number, now = new Date()): Promise<void> {
    const date = vietnamDate(now); const iso = now.toISOString();
    if (questionCount >= 10) await this.increment(guildId,userId,date,'complete_session',1,iso);
    await this.recordStreak(guildId,userId,sessionId,date,iso);
    await this.reconcile(guildId,userId,date,now);
  }
  async recordMeditation(guildId: string, userId: string, minutes: number, now = new Date()): Promise<void> {
    const date = vietnamDate(now); await this.increment(guildId,userId,date,'meditate_minutes',minutes,now.toISOString());
    await this.reconcile(guildId,userId,date,now);
  }
  async getDaily(guildId: string, userId: string, now = new Date()): Promise<QuestProgress[]> {
    const date = vietnamDate(now); await this.ensureAll(guildId,userId,date,now.toISOString()); await this.reconcile(guildId,userId,date,now);
    return this.sqlite.prepare(`SELECT quest_key AS questKey, progress, completed_at AS completedAt,
      rewarded_at AS rewardedAt, xp_awarded AS xpAwarded FROM daily_quest_progress
      WHERE guild_id=? AND user_id=? AND activity_date=? ORDER BY quest_key`).all(guildId,userId,date) as QuestProgress[];
  }
  async getStreak(guildId: string, userId: string): Promise<Streak> {
    return (this.sqlite.prepare(`SELECT current_streak AS currentStreak,longest_streak AS longestStreak,
      last_active_date AS lastActiveDate FROM learning_streaks WHERE guild_id=? AND user_id=?`).get(guildId,userId) as Streak | undefined)
      ?? { currentStreak: 0, longestStreak: 0, lastActiveDate: null };
  }
  async activityDays(guildId: string, userId: string): Promise<string[]> {
    return (this.sqlite.prepare(`SELECT activity_date AS date FROM learning_activity_days
      WHERE guild_id=? AND user_id=? ORDER BY activity_date DESC LIMIT 10`).all(guildId,userId) as {date:string}[]).map(x=>x.date);
  }
  private async increment(guildId:string,userId:string,date:string,key:QuestKey,amount:number,now:string): Promise<void> {
    const config=QUESTS[key];
    this.sqlite.prepare(`INSERT INTO daily_quest_progress(guild_id,user_id,activity_date,quest_key,progress,completed_at,updated_at)
      VALUES(?,?,?,?,?,?,?) ON CONFLICT(guild_id,user_id,activity_date,quest_key) DO UPDATE SET
      progress=MIN(?,daily_quest_progress.progress+?),
      completed_at=CASE WHEN daily_quest_progress.completed_at IS NULL AND daily_quest_progress.progress+?>=? THEN ? ELSE daily_quest_progress.completed_at END,
      updated_at=?`).run(guildId,userId,date,key,Math.min(amount,config.target),amount>=config.target?now:null,now,
        config.target,amount,amount,config.target,now,now);
  }
  private async ensureAll(guildId:string,userId:string,date:string,now:string): Promise<void> {
    for (const key of Object.keys(QUESTS) as QuestKey[]) this.sqlite.prepare(`INSERT OR IGNORE INTO daily_quest_progress
      (guild_id,user_id,activity_date,quest_key,updated_at) VALUES(?,?,?,?,?)`).run(guildId,userId,date,key,now);
  }
  private async reconcile(guildId:string,userId:string,date:string,now:Date): Promise<void> {
    await this.ensureAll(guildId,userId,date,now.toISOString());
    const pending=this.sqlite.prepare(`SELECT quest_key AS questKey FROM daily_quest_progress
      WHERE guild_id=? AND user_id=? AND activity_date=? AND completed_at IS NOT NULL AND rewarded_at IS NULL`)
      .all(guildId,userId,date) as {questKey:QuestKey}[];
    for (const {questKey} of pending) {
      const cfg=QUESTS[questKey]; const meditation=questKey==='meditate_minutes';
      const award=await this.xp.awardExternal(guildId,userId,cfg.reward,`quest_${questKey}`,`quest:${guildId}:${userId}:${date}:${questKey}`,
        { now, scopedDailyCap: meditation?60:undefined, scopedSources: meditation?['meditation_tick','quest_meditate_minutes']:undefined, maxTotalXp: meditation?1750:undefined });
      this.sqlite.prepare(`UPDATE daily_quest_progress SET rewarded_at=?,xp_awarded=?,updated_at=?
        WHERE guild_id=? AND user_id=? AND activity_date=? AND quest_key=? AND rewarded_at IS NULL`)
        .run(now.toISOString(),award.awarded,now.toISOString(),guildId,userId,date,questKey);
    }
  }
  private async recordStreak(guildId:string,userId:string,sessionId:string,date:string,now:string): Promise<void> {
    const inserted=this.sqlite.prepare(`INSERT OR IGNORE INTO learning_activity_days
      (guild_id,user_id,activity_date,session_id,created_at) VALUES(?,?,?,?,?)`).run(guildId,userId,date,sessionId,now).changes;
    if (!inserted) return;
    const old=await this.getStreak(guildId,userId); const previous=addDays(date,-1);
    const current=old.lastActiveDate===previous?old.currentStreak+1:1;
    this.sqlite.prepare(`INSERT INTO learning_streaks(guild_id,user_id,current_streak,longest_streak,last_active_date,updated_at)
      VALUES(?,?,?,?,?,?) ON CONFLICT(guild_id,user_id) DO UPDATE SET current_streak=excluded.current_streak,
      longest_streak=MAX(learning_streaks.longest_streak,excluded.current_streak),last_active_date=excluded.last_active_date,updated_at=excluded.updated_at`)
      .run(guildId,userId,current,Math.max(old.longestStreak,current),date,now);
  }
}
function addDays(date:string,amount:number):string { const d=new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate()+amount); return d.toISOString().slice(0,10); }
