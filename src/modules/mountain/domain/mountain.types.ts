export type MountainStatus='WAITING'|'ACTIVE'|'COMPLETED'|'CANCELLED'|'EXPIRED';
export type MountainKind='solo'|'multi';
export type MountainQuestion={entryId:number;direction:'han_vi'|'vi_han';prompt:string;options:string[];correctIndex:number;hanzi:string;meaning:string};
export type MountainMatch={id:string;guildId:string;channelId:string;ownerId:string;kind:MountainKind;deckId:number;deckName:string;status:MountainStatus;currentRound:number;messageId:string|null;roundStartedAt:string|null;roundDeadline:string|null;createdAt:string;updatedAt:string};
export type MountainPlayer={matchId:string;userId:string;displayName:string;score:number;correctCount:number;totalTimeMs:number;completedRounds:number;xpAwarded:number;rewardDate:string|null;joinedAt:string};
export type MountainRound={matchId:string;roundIndex:number;question:MountainQuestion;openedAt:string|null;deadline:string|null;closedAt:string|null};
export type MountainAnswer={matchId:string;roundIndex:number;userId:string;optionIndex:number;correct:boolean;elapsedMs:number;score:number;answeredAt:string};
export class MountainError extends Error{constructor(message:string){super(message);this.name='MountainError';}}
