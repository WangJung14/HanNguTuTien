import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { vietnamDate, type XpService } from '../../cultivation/application/xp.service.js';
import type { QuestService } from '../../quests/index.js';
import { MEDITATION_CONFIG, MEDITATION_SOURCES } from '../domain/meditation.config.js';

type Session={id:string;guildId:string;userId:string;channelId:string;startedAt:string;nextRewardAt:string;tickIndex:number};
export class MeditationService {
  constructor(private readonly sqlite:Database.Database,private readonly xp:XpService,private readonly quests:Pick<QuestService,'recordMeditation'>){}
  async setChannel(guildId:string,channelId:string|null,now=new Date()):Promise<void>{
    await this.endGuild(guildId,now);
    this.sqlite.prepare(`INSERT INTO meditation_config(guild_id,channel_id,updated_at) VALUES(?,?,?)
      ON CONFLICT(guild_id) DO UPDATE SET channel_id=excluded.channel_id,updated_at=excluded.updated_at`).run(guildId,channelId,now.toISOString());
  }
  async getChannel(guildId:string):Promise<string|null> { return (this.sqlite.prepare('SELECT channel_id AS channelId FROM meditation_config WHERE guild_id=?').get(guildId) as {channelId:string|null}|undefined)?.channelId??null; }
  async start(guildId:string,userId:string,channelId:string,now=new Date()):Promise<boolean> {
    if(await this.getChannel(guildId)!==channelId)return false;
    await this.end(guildId,userId,now);
    const iso=now.toISOString(); const next=new Date(now.getTime()+MEDITATION_CONFIG.intervalMinutes*60_000).toISOString();
    this.sqlite.prepare(`INSERT INTO meditation_sessions(id,guild_id,user_id,channel_id,status,started_at,next_reward_at,updated_at)
      VALUES(?,?,?,?, 'active',?,?,?)`).run(randomUUID(),guildId,userId,channelId,iso,next,iso); return true;
  }
  async end(guildId:string,userId:string,now=new Date()):Promise<void> { this.sqlite.prepare(`UPDATE meditation_sessions SET status='ended',ended_at=?,updated_at=? WHERE guild_id=? AND user_id=? AND status='active'`).run(now.toISOString(),now.toISOString(),guildId,userId); }
  async endAll(now=new Date()):Promise<void> { this.sqlite.prepare(`UPDATE meditation_sessions SET status='ended',ended_at=?,updated_at=? WHERE status='active'`).run(now.toISOString(),now.toISOString()); }
  async endGuild(guildId:string,now=new Date()):Promise<void> { this.sqlite.prepare(`UPDATE meditation_sessions SET status='ended',ended_at=?,updated_at=? WHERE guild_id=? AND status='active'`).run(now.toISOString(),now.toISOString(),guildId); }
  async processDue(now=new Date()):Promise<number> {
    const sessions=this.sqlite.prepare(`SELECT id,guild_id AS guildId,user_id AS userId,channel_id AS channelId,
      started_at AS startedAt,next_reward_at AS nextRewardAt,tick_index AS tickIndex FROM meditation_sessions
      WHERE status='active' AND next_reward_at<=?`).all(now.toISOString()) as Session[];
    let processed=0;
    for(const initial of sessions){ let session=initial;
      while(session.nextRewardAt<=now.toISOString()){
        const tick=session.tickIndex+1; const tickTime=new Date(session.nextRewardAt); const date=vietnamDate(tickTime);
        const existing=this.sqlite.prepare('SELECT 1 FROM meditation_rewards WHERE session_id=? AND tick_index=?').get(session.id,tick);
        if(existing)break;
        const award=await this.xp.awardExternal(session.guildId,session.userId,MEDITATION_CONFIG.xpPerInterval,'meditation_tick',`meditation:${session.id}:${tick}`,
          {sessionId:session.id,now:tickTime,scopedDailyCap:MEDITATION_CONFIG.dailyXpCap,scopedSources:MEDITATION_SOURCES,maxTotalXp:MEDITATION_CONFIG.maxTotalXp});
        this.sqlite.prepare(`INSERT OR IGNORE INTO meditation_rewards(session_id,tick_index,guild_id,user_id,activity_date,minutes,xp_awarded,created_at)
          VALUES(?,?,?,?,?,?,?,?)`).run(session.id,tick,session.guildId,session.userId,date,MEDITATION_CONFIG.intervalMinutes,award.awarded,tickTime.toISOString());
        const next=new Date(tickTime.getTime()+MEDITATION_CONFIG.intervalMinutes*60_000).toISOString();
        this.sqlite.prepare(`UPDATE meditation_sessions SET tick_index=?,next_reward_at=?,updated_at=? WHERE id=? AND status='active'`)
          .run(tick,next,now.toISOString(),session.id);
        await this.quests.recordMeditation(session.guildId,session.userId,MEDITATION_CONFIG.intervalMinutes,tickTime); processed++;
        session={...session,tickIndex:tick,nextRewardAt:new Date(tickTime.getTime()+MEDITATION_CONFIG.intervalMinutes*60_000).toISOString()};
      }
    }
    return processed;
  }
  async status(guildId:string,userId:string,now=new Date()){
    const date=vietnamDate(now);
    const minutes=(this.sqlite.prepare(`SELECT COALESCE(SUM(minutes),0) AS value FROM meditation_rewards
      WHERE guild_id=? AND user_id=? AND activity_date=?`).get(guildId,userId,date) as {value:number}).value;
    const xp=(this.sqlite.prepare(`SELECT COALESCE(SUM(amount),0) AS value FROM xp_ledger
      WHERE guild_id=? AND user_id=? AND earned_date=? AND source IN ('meditation_tick','quest_meditate_minutes')`)
      .get(guildId,userId,date) as {value:number}).value;
    const active=this.sqlite.prepare(`SELECT channel_id AS channelId,started_at AS startedAt,next_reward_at AS nextRewardAt
      FROM meditation_sessions WHERE guild_id=? AND user_id=? AND status='active'`).get(guildId,userId) as {channelId:string;startedAt:string;nextRewardAt:string}|undefined;
    return {minutes,xp,active:active??null,remainingXp:Math.max(0,MEDITATION_CONFIG.dailyXpCap-xp),channelId:await this.getChannel(guildId)};
  }
}
