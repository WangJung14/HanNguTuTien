export type AdventureOption={id:string;label:string;correct:boolean;feedback:string};
export type AdventureScene={id:string;title:string;npc:string|null;kind:'story'|'question';text:string;prompt:string;lesson:string;options:AdventureOption[]};
export type AdventureChapter={id:string;title:string;summary:string;scenes:AdventureScene[]};
export type AdventurePack={version:number;locale:string;chapters:AdventureChapter[]};
export type AdventureProgress={guildId:string;userId:string;chapterIndex:number;sceneIndex:number;status:'ACTIVE'|'COMPLETED';version:number;createdAt:string;updatedAt:string};
export type AdventureCompletion={chapterIndex:number;completedAt:string;xpAwarded:number;rewardClaimed:boolean};
export type AdventureChoiceResult={progress:AdventureProgress;correct:boolean;duplicate:boolean;chapterCompleted:boolean;adventureCompleted:boolean;feedback:string};
export interface AdventureRepository{
 getOrCreate(guildId:string,userId:string,now:string):Promise<AdventureProgress>;
 startChapter(guildId:string,userId:string,chapterIndex:number,maxUnlocked:number,now:string):Promise<AdventureProgress>;
 choose(value:{eventKey:string;guildId:string;userId:string;chapterIndex:number;sceneIndex:number;version:number;optionId:string;correct:boolean;feedback:string;lastScene:boolean;lastChapter:boolean;now:string}):Promise<AdventureChoiceResult>;
 completions(guildId:string,userId:string):Promise<AdventureCompletion[]>;
 markXp(guildId:string,userId:string,chapterIndex:number,xp:number):Promise<void>;
}
export class AdventureError extends Error{constructor(message:string){super(message);this.name='AdventureError';}}
