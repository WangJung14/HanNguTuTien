import { randomUUID } from 'node:crypto';
import type { RealmService } from '../../cultivation/index.js';
import { vietnamDate } from '../../cultivation/application/xp.service.js';
import { SECT_CONFIG, vietnamWeekKey } from '../domain/sect.config.js';
import { SectError, type SectRepository } from '../domain/sect.types.js';

export class SectService{
 constructor(private readonly repo:SectRepository,private readonly realms:RealmService){}
 async create(guildId:string,userId:string,rawName:string,description=''){
  const progress=await this.realms.getProgress(guildId,userId);
  if(progress.profile.totalXp<SECT_CONFIG.minCreateXp)throw new SectError('Cần ít nhất Luyện Khí tầng 1 (100 XP) để khai sơn lập phái.');
  const name=rawName.normalize('NFKC').trim().replace(/\s+/gu,' ');if([...name].length<2||[...name].length>40)throw new SectError('Tên Tông Môn phải từ 2 đến 40 ký tự.');
  const desc=description.normalize('NFC').trim();if([...desc].length>300)throw new SectError('Mô tả tối đa 300 ký tự.');
  try{return await this.repo.createSect({id:randomUUID(),guildId,userId,name,nameKey:name.toLocaleLowerCase('vi-VN'),description:desc,maxMembers:SECT_CONFIG.defaultMaxMembers,now:new Date().toISOString()});}
  catch(error){if(error instanceof Error&&(/UNIQUE|unique|23505/u.test(error.message)))throw new SectError('Tên Tông Môn đã tồn tại hoặc bạn đã thuộc một Tông Môn trong server.');throw error;}
 }
 list(guildId:string){return this.repo.listSects(guildId,25);} get(guildId:string,id:string){return this.repo.getSect(guildId,id);}
 async profile(guildId:string,userId:string){const member=await this.repo.membership(guildId,userId);if(!member)return null;const sect=await this.repo.getSect(guildId,member.sectId);return sect?{sect,member,members:await this.repo.members(sect.id)}:null;}
 async request(guildId:string,userId:string,sectId:string){if(await this.repo.membership(guildId,userId))throw new SectError('Bạn đã thuộc một Tông Môn trong server.');const sect=await this.repo.getSect(guildId,sectId);if(!sect||sect.status!=='ACTIVE')throw new SectError('Không tìm thấy Tông Môn đang hoạt động.');await this.repo.requestJoin({id:randomUUID(),sectId,guildId,userId,status:'PENDING',createdAt:new Date().toISOString(),resolvedAt:null,resolvedBy:null});}
 async requests(guildId:string,userId:string){const member=await this.requireOfficer(guildId,userId);return this.repo.pendingRequests(member.sectId);}
 async resolve(guildId:string,userId:string,requestId:string,approve:boolean){await this.requireOfficer(guildId,userId);await this.repo.resolveRequest(requestId,userId,approve,new Date().toISOString());}
 async invite(guildId:string,userId:string,targetId:string){await this.requireOfficer(guildId,userId);await this.repo.invite(guildId,userId,targetId,new Date().toISOString());}
 async leave(guildId:string,userId:string){await this.repo.leave(guildId,userId,new Date().toISOString());}
 async disband(guildId:string,userId:string){await this.repo.disband(guildId,userId,new Date().toISOString());}
 async setRole(guildId:string,userId:string,targetId:string,role:'DEPUTY'|'DISCIPLE'){await this.repo.setRole(guildId,userId,targetId,role,new Date().toISOString());}
 async transfer(guildId:string,userId:string,targetId:string){await this.repo.transfer(guildId,userId,targetId,new Date().toISOString());}
 async kick(guildId:string,userId:string,targetId:string){await this.repo.kick(guildId,userId,targetId);}
 async quests(guildId:string,userId:string){const member=await this.requireMember(guildId,userId);return this.repo.questProgress(member.sectId,vietnamWeekKey(),new Date().toISOString());}
 async contributions(guildId:string,userId:string,weekly=true){const member=await this.requireMember(guildId,userId);return this.repo.memberContributions(member.sectId,weekly?vietnamWeekKey():null);}
 rankings(guildId:string,weekly=true){return this.repo.rankings(guildId,weekly?vietnamWeekKey():null,20);}
 private async requireMember(guildId:string,userId:string){const m=await this.repo.membership(guildId,userId);if(!m)throw new SectError('Bạn chưa thuộc Tông Môn nào trong server.');return m;}
 private async requireOfficer(guildId:string,userId:string){const m=await this.requireMember(guildId,userId);if(m.role==='DISCIPLE')throw new SectError('Chỉ Tông Chủ hoặc Phó Tông Chủ được thực hiện thao tác này.');return m;}
}

export class SectContributionService{
 constructor(private readonly repo:SectRepository){}
 async award(guildId:string,userId:string,amount:number,source:string,rewardKey:string,now=new Date()){
  return this.repo.awardContribution({guildId,userId,amount,source,rewardKey,earnedDate:vietnamDate(now),weekKey:vietnamWeekKey(now),now:now.toISOString(),dailyCap:SECT_CONFIG.dailyContributionCap});
 }
 recordCorrect(guildId:string,userId:string,eventKey:string,now=new Date()){return this.repo.recordQuestEvent({guildId,userId,eventKey,correctDelta:1,sessionDelta:0,weekKey:vietnamWeekKey(now),now:now.toISOString()});}
 async recordSession(guildId:string,userId:string,sessionId:string,questionCount:number,now=new Date()){
  if(questionCount<10)return;
  await this.repo.recordQuestEvent({guildId,userId,eventKey:`sect-session:${sessionId}`,correctDelta:0,sessionDelta:1,weekKey:vietnamWeekKey(now),now:now.toISOString()});
  await this.award(guildId,userId,10,'dictation_session',`sect:dictation:${sessionId}`,now);
 }
 breakthrough(guildId:string,userId:string,attemptId:string,now=new Date()){return this.award(guildId,userId,30,'breakthrough',`sect:breakthrough:${attemptId}:${userId}`,now);}
 mountain(guildId:string,userId:string,matchId:string,now=new Date()){return this.award(guildId,userId,10,'mountain_complete',`sect:mountain:${matchId}:${userId}`,now);}
 secret(guildId:string,userId:string,runId:string,now=new Date()){return this.award(guildId,userId,20,'secret_clear',`sect:secret:${runId}:${userId}`,now);}
 boss(guildId:string,userId:string,runId:string,now=new Date()){return this.award(guildId,userId,30,'boss_win',`sect:boss:${runId}:${userId}`,now);}
}
