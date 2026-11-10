export const MOUNTAIN_CONFIG={questionCount:10,roundMs:10_000,maxPlayers:20,xpReward:10,minCorrectForXp:6,dailyXpMatches:2,waitingTtlMs:30*60_000,schedulerMs:500} as const;
export function scoreAnswer(elapsedMs:number,correct:boolean):number{
  if(!correct||elapsedMs<0||elapsedMs>10_000)return 0;
  if(elapsedMs<=1_000)return 100;if(elapsedMs<=2_000)return 90;
  if(elapsedMs<=3_000)return 80;if(elapsedMs<=4_000)return 70;if(elapsedMs<=5_000)return 60;
  if(elapsedMs<=6_000)return 50;if(elapsedMs<=7_000)return 40;if(elapsedMs<=8_000)return 30;
  return 20;
}
