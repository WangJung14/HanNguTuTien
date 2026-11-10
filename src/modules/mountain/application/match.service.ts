import{randomUUID}from'node:crypto';
import{vietnamDate,type XpService}from'../../cultivation/application/xp.service.js';
import{MOUNTAIN_CONFIG}from'../domain/score-rules.js';
import{MountainError,type MountainKind,type MountainMatch}from'../domain/mountain.types.js';
import type{SqliteMountainRepository}from'../infrastructure/sqlite-mountain.repository.js';
import type{MountainQuestionService}from'./question.service.js';
export class MountainMatchService{
 constructor(private readonly repo:SqliteMountainRepository,private readonly questions:MountainQuestionService,private readonly xp:XpService){}
 create(guildId:string,channelId:string,userId:string,name:string,deckId:number,kind:MountainKind,random:()=>number=Math.random){
  if(this.repo.findPlayerActive(guildId,userId))throw new MountainError('Bạn đang ở trong một trận Leo Núi khác trong server này.');
  if(kind==='multi'&&this.repo.findChannel(guildId,channelId))throw new MountainError('Channel này đã có một phòng Leo Núi đang hoạt động.');
  const built=this.questions.build(guildId,userId,deckId,random),now=new Date().toISOString();const match:MountainMatch={id:randomUUID(),guildId,channelId,ownerId:userId,kind,deckId,deckName:built.deckName,status:kind==='solo'?'ACTIVE':'WAITING',currentRound:0,messageId:null,roundStartedAt:null,roundDeadline:null,createdAt:now,updatedAt:now};
  try{this.repo.create(match,built.questions,name);}catch(e){if(e instanceof Error&&/UNIQUE constraint/u.test(e.message))throw new MountainError('Không thể tạo trận do phòng hoặc người chơi đã có trận khác.');throw e;}return match;
 }
 getOwned(id:string,guildId:string,userId:string,messageId?:string){const m=this.repo.get(id);if(!m||m.guildId!==guildId)throw new MountainError('Không tìm thấy trận Leo Núi.');if(!this.repo.players(id).some(p=>p.userId===userId))throw new MountainError('Bạn không thuộc trận này.');if(messageId&&m.messageId!==messageId)throw new MountainError('Đây là giao diện trận cũ.');return m;}
 findChannel(guildId:string,channelId:string){return this.repo.findChannel(guildId,channelId);}
 bind(id:string,messageId:string){if(!this.repo.bind(id,messageId,new Date().toISOString()))throw new MountainError('Không thể liên kết message trận đấu.');}
 join(matchId:string,guildId:string,userId:string,name:string){if(!this.repo.join(matchId,guildId,userId,name,new Date().toISOString(),MOUNTAIN_CONFIG.maxPlayers))throw new MountainError('Không thể tham gia: phòng đã bắt đầu/đầy hoặc bạn đang ở trận khác.');return this.repo.players(matchId);}
 startMulti(id:string,guildId:string,userId:string){const m=this.repo.get(id);if(!m||m.guildId!==guildId||m.kind!=='multi'||m.status!=='WAITING')throw new MountainError('Phòng không còn ở trạng thái chờ.');if(m.ownerId!==userId)throw new MountainError('Chỉ chủ phòng được bắt đầu.');if(this.repo.players(id).length<2)throw new MountainError('Cần ít nhất 2 người chơi.');if(!this.repo.activate(id,new Date().toISOString()))throw new MountainError('Phòng vừa thay đổi trạng thái.');return this.repo.get(id)!;}
 currentRound(id:string){const m=this.repo.get(id);if(!m)throw new MountainError('Không tìm thấy trận.');const r=this.repo.getRound(id,m.currentRound);if(!r)throw new MountainError('Không tìm thấy vòng hiện tại.');return r;}
 openRound(id:string,index:number,sentAt=new Date()){const deadline=new Date(sentAt.getTime()+MOUNTAIN_CONFIG.roundMs);if(!this.repo.openRound(id,index,sentAt.toISOString(),deadline.toISOString()))throw new MountainError('Không thể mở vòng thi.');return{openedAt:sentAt,deadline};}
 answer(id:string,index:number,userId:string,option:number,receivedAt=new Date()){const a=this.repo.answer(id,index,userId,option,receivedAt);if(!a)throw new MountainError('Đáp án bị từ chối: đã trả lời, sai vòng hoặc quá 10 giây.');return a;}
 closeRound(id:string,index:number,now=new Date()){const updated=this.repo.closeAndAdvance(id,index,now.toISOString());if(!updated)throw new MountainError('Vòng đã được xử lý trước đó.');if(updated.status==='COMPLETED')this.reward(updated,now);return updated;}
 cancel(id:string,guildId:string,userId:string,isAdmin=false){const m=this.repo.get(id);if(!m||m.guildId!==guildId)throw new MountainError('Không tìm thấy trận.');if(m.ownerId!==userId&&!isAdmin)throw new MountainError('Chỉ chủ phòng hoặc admin được hủy.');if(!this.repo.cancel(id,'CANCELLED',new Date().toISOString()))throw new MountainError('Trận đã kết thúc.');}
 expireWaiting(now=new Date()){const cutoff=new Date(now.getTime()-MOUNTAIN_CONFIG.waitingTtlMs).toISOString();for(const m of this.repo.expiredWaiting(cutoff))this.repo.cancel(m.id,'EXPIRED',now.toISOString());}
 cancelActiveOnRestart(){return this.repo.cancelActiveOnRestart(new Date().toISOString());}
 players(id:string){return this.repo.players(id);}
 leaderboard(guildId:string){return this.repo.leaderboard(guildId);}
 history(guildId:string,userId:string){return this.repo.history(guildId,userId);}
 due(now=new Date()){return this.repo.due(now.toISOString());}
 cancelUnsafe(id:string){this.repo.cancel(id,'CANCELLED',new Date().toISOString());}
 private reward(match:MountainMatch,now:Date){const date=vietnamDate(now);for(const p of this.repo.players(match.id)){if(p.completedRounds!==10||p.correctCount<MOUNTAIN_CONFIG.minCorrectForXp||p.xpAwarded>0)continue;this.repo.sqlite.transaction(()=>{if(this.repo.rewardedCount(match.guildId,p.userId,date)>=MOUNTAIN_CONFIG.dailyXpMatches)return;const a=this.xp.awardExternal(match.guildId,p.userId,MOUNTAIN_CONFIG.xpReward,'mountain_complete',`mountain:${match.id}:${p.userId}`,{sessionId:match.id,now});this.repo.markXp(match.id,p.userId,a.awarded,date);})();}}
}
