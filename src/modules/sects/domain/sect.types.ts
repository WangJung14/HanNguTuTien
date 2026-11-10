import type { SectQuestKey } from './sect.config.js';

export type SectRole='MASTER'|'DEPUTY'|'DISCIPLE';
export type Sect={id:string;guildId:string;name:string;description:string;maxMembers:number;reputation:number;foundedAt:string;status:'ACTIVE'|'DISBANDED';memberCount:number};
export type SectMember={sectId:string;guildId:string;userId:string;role:SectRole;joinedAt:string};
export type JoinRequest={id:string;sectId:string;guildId:string;userId:string;status:'PENDING'|'APPROVED'|'REJECTED'|'CANCELLED';createdAt:string;resolvedAt:string|null;resolvedBy:string|null};
export type ContributionAward={awarded:number;duplicate:boolean;capped:boolean;sectId:string|null};
export type SectQuestProgress={questKey:SectQuestKey;target:number;progress:number;rewardReputation:number;completedAt:string|null;rewardedAt:string|null};
export type SectRanking={sectId:string;name:string;cp:number;reputation:number;memberCount:number;foundedAt:string};
export type MemberContribution={userId:string;cp:number;role:SectRole;joinedAt:string};
export type CultivationRankRow={userId:string;totalXp:number;majorIndex:number;updatedAt:string};
export type LeaderboardConfig={guildId:string;channelId:string|null;messageId:string|null;enabled:boolean;dirty:boolean;lastUpdatedAt:string|null};
export class SectError extends Error{constructor(message:string){super(message);this.name='SectError';}}

export interface SectRepository{
 createSect(value:{id:string;guildId:string;userId:string;name:string;nameKey:string;description:string;maxMembers:number;now:string}):Promise<Sect>;
 listSects(guildId:string,limit:number):Promise<Sect[]>;getSect(guildId:string,sectId:string):Promise<Sect|null>;
 membership(guildId:string,userId:string):Promise<SectMember|null>;members(sectId:string):Promise<SectMember[]>;
 requestJoin(value:JoinRequest):Promise<void>;pendingRequests(sectId:string):Promise<JoinRequest[]>;
 resolveRequest(requestId:string,actorId:string,approve:boolean,now:string):Promise<void>;
 invite(guildId:string,actorId:string,targetId:string,now:string):Promise<void>;
 leave(guildId:string,userId:string,now:string):Promise<void>;disband(guildId:string,actorId:string,now:string):Promise<void>;
 setRole(guildId:string,actorId:string,targetId:string,role:'DEPUTY'|'DISCIPLE',now:string):Promise<void>;
 transfer(guildId:string,actorId:string,targetId:string,now:string):Promise<void>;kick(guildId:string,actorId:string,targetId:string):Promise<void>;
 awardContribution(value:{guildId:string;userId:string;amount:number;source:string;rewardKey:string;earnedDate:string;weekKey:string;now:string;dailyCap:number}):Promise<ContributionAward>;
 recordQuestEvent(value:{guildId:string;userId:string;eventKey:string;correctDelta:number;sessionDelta:number;weekKey:string;now:string}):Promise<void>;
 questProgress(sectId:string,weekKey:string,now:string):Promise<SectQuestProgress[]>;
 memberContributions(sectId:string,weekKey:string|null):Promise<MemberContribution[]>;
 rankings(guildId:string,weekKey:string|null,limit:number):Promise<SectRanking[]>;
 cultivationRanks(guildId:string):Promise<CultivationRankRow[]>;
 getLeaderboardConfig(guildId:string):Promise<LeaderboardConfig|null>;
 setLeaderboardConfig(guildId:string,channelId:string|null,enabled:boolean,now:string):Promise<void>;
 bindLeaderboardMessage(guildId:string,messageId:string,now:string):Promise<void>;
 markLeaderboardDirty(guildId:string,now:string):Promise<void>;
 dueLeaderboards(cutoff:string):Promise<LeaderboardConfig[]>;
 markLeaderboardUpdated(guildId:string,now:string):Promise<void>;
}
