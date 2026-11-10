export type HskLevel='HSK1'|'HSK2'|'HSK3';export type PveStatus='WAITING'|'ACTIVE'|'COMPLETED'|'FAILED'|'CANCELLED';export type PveKind='secret'|'boss';
export type PackQuestion={id:string;level:HskLevel;type:'han_vi'|'vi_han'|'pinyin';prompt:string;options:string[];correctIndex:number;explanation:string;hanzi:string;pinyin:string;meaning:string};
export type PveRun={id:string;kind:PveKind;guildId:string;channelId:string;ownerId:string;level:HskLevel;status:PveStatus;currentRound:number;correctCount:number;score:number;bossHp:number|null;bossMaxHp:number|null;messageId:string|null;roundStartedAt:string|null;roundDeadline:string|null;weekKey:string|null;createdAt:string;updatedAt:string;completedAt:string|null};
export type PvePlayer={runId:string;userId:string;displayName:string;correctCount:number;answeredCount:number;damage:number;completedRounds:number;xpAwarded:number;joinedAt:string};
export type PveRound={runId:string;roundIndex:number;question:PackQuestion;openedAt:string|null;deadline:string|null;closedAt:string|null};
export class PveError extends Error{constructor(message:string){super(message);this.name='PveError';}}
