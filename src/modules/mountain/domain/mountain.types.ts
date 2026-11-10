export type MountainStatus='WAITING'|'ACTIVE'|'COMPLETED'|'CANCELLED'|'EXPIRED';
export type MountainKind='solo'|'multi';
export type MountainQuestion={entryId:number;direction:'han_vi'|'vi_han';prompt:string;options:string[];correctIndex:number;hanzi:string;meaning:string};
export type MountainMatch={id:string;guildId:string;channelId:string;ownerId:string;kind:MountainKind;deckId:number;deckName:string;status:MountainStatus;currentRound:number;messageId:string|null;roundStartedAt:string|null;roundDeadline:string|null;createdAt:string;updatedAt:string};
export type MountainPlayer={matchId:string;userId:string;displayName:string;score:number;correctCount:number;totalTimeMs:number;completedRounds:number;xpAwarded:number;rewardDate:string|null;joinedAt:string};
export type MountainRound={matchId:string;roundIndex:number;question:MountainQuestion;openedAt:string|null;deadline:string|null;closedAt:string|null};
export type MountainAnswer={matchId:string;roundIndex:number;userId:string;optionIndex:number;correct:boolean;elapsedMs:number;score:number;answeredAt:string};
export type Awaitable<T>=T|Promise<T>;
export interface MountainRepository{
 create(match:MountainMatch,questions:MountainQuestion[],displayName:string):Awaitable<void>;
 get(id:string):Awaitable<MountainMatch|null>;
 findChannel(guildId:string,channelId:string):Awaitable<MountainMatch|null>;
 findPlayerActive(guildId:string,userId:string):Awaitable<MountainMatch|null>;
 players(id:string):Awaitable<MountainPlayer[]>;
 getRound(id:string,index:number):Awaitable<MountainRound|null>;
 join(id:string,guildId:string,userId:string,name:string,now:string,max:number):Awaitable<boolean>;
 bind(id:string,messageId:string,now:string):Awaitable<boolean>;
 activate(id:string,now:string):Awaitable<boolean>;
 openRound(id:string,index:number,opened:string,deadline:string):Awaitable<boolean>;
 answer(id:string,index:number,userId:string,option:number,received:Date):Awaitable<MountainAnswer|null>;
 closeAndAdvance(id:string,index:number,now:string):Awaitable<MountainMatch|null>;
 cancel(id:string,status:'CANCELLED'|'EXPIRED',now:string):Awaitable<boolean>;
 due(now:string):Awaitable<MountainMatch[]>;
 expiredWaiting(cutoff:string):Awaitable<MountainMatch[]>;
 cancelActiveOnRestart(now:string):Awaitable<number>;
 markXp(id:string,userId:string,amount:number,date:string):Awaitable<void>;
 rewardedCount(guildId:string,userId:string,date:string):Awaitable<number>;
 leaderboard(guildId:string):Awaitable<Array<{userId:string;displayName:string;score:number;correctCount:number;totalTimeMs:number;matches:number}>>;
 history(guildId:string,userId:string):Awaitable<Array<{id:string;kind:string;status:string;score:number;correctCount:number;totalTimeMs:number;xpAwarded:number;createdAt:string;deckName:string}>>;
}
export class MountainError extends Error{constructor(message:string){super(message);this.name='MountainError';}}
