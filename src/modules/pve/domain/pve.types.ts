export type HskLevel='HSK1'|'HSK2'|'HSK3';export type PveStatus='WAITING'|'ACTIVE'|'COMPLETED'|'FAILED'|'CANCELLED';export type PveKind='secret'|'boss';
export type PackQuestion={id:string;level:HskLevel;type:'han_vi'|'vi_han'|'pinyin';prompt:string;options:string[];correctIndex:number;explanation:string;hanzi:string;pinyin:string;meaning:string};
export type PveRun={id:string;kind:PveKind;guildId:string;channelId:string;ownerId:string;level:HskLevel;status:PveStatus;currentRound:number;correctCount:number;score:number;bossHp:number|null;bossMaxHp:number|null;messageId:string|null;roundStartedAt:string|null;roundDeadline:string|null;weekKey:string|null;createdAt:string;updatedAt:string;completedAt:string|null};
export type PvePlayer={runId:string;userId:string;displayName:string;correctCount:number;answeredCount:number;damage:number;completedRounds:number;xpAwarded:number;joinedAt:string};
export type PveRound={runId:string;roundIndex:number;question:PackQuestion;openedAt:string|null;deadline:string|null;closedAt:string|null};
export type Awaitable<T>=T|Promise<T>;
export type PveHistoryRow={id:string;level:HskLevel;status:PveStatus;runCorrect:number;score:number;bossHp:number|null;bossMaxHp:number|null;createdAt:string;correctCount:number;damage:number;xpAwarded:number};
export type PveLeaderboardRow={userId:string;displayName:string;damage:number;correctCount:number;matches:number};
export interface PveRepository{
 get(id:string):Awaitable<PveRun|null>;
 players(id:string):Awaitable<PvePlayer[]>;
 round(id:string,index:number):Awaitable<PveRound|null>;
 activeFor(guild:string,user:string):Awaitable<PveRun|null>;
 bossChannel(guild:string,channel:string):Awaitable<PveRun|null>;
 bossWeek(guild:string,week:string):Awaitable<PveRun|null>;
 create(run:PveRun,questions:PackQuestion[],name:string):Awaitable<void>;
 join(id:string,guild:string,user:string,name:string,max:number,now:string):Awaitable<boolean>;
 bind(id:string,msg:string,now:string):Awaitable<boolean>;
 activateBoss(id:string,hp:number,now:string):Awaitable<boolean>;
 open(id:string,index:number,start:string,deadline:string):Awaitable<boolean>;
 answer(id:string,index:number,user:string,option:number,received:Date):Awaitable<{correct:boolean;damage:number;question:PackQuestion}|null>;
 close(id:string,index:number,now:string,total:number):Awaitable<PveRun|null>;
 cancel(id:string,now:string):Awaitable<boolean>;
 due(now:string):Awaitable<PveRun[]>;
 cancelActive(now:string):Awaitable<number>;
 markXp(id:string,user:string,xp:number):Awaitable<void>;
 mistakes(id:string,user:string):Awaitable<PackQuestion[]>;
 stageCorrect(id:string,user:string,endExclusive:number):Awaitable<number>;
 history(guild:string,user:string,kind:'secret'|'boss'):Awaitable<PveHistoryRow[]>;
 bossLeaderboard(guild:string):Awaitable<PveLeaderboardRow[]>;
}
export class PveError extends Error{constructor(message:string){super(message);this.name='PveError';}}
