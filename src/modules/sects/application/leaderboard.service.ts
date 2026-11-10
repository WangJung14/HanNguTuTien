import { EmbedBuilder, type Client, type Guild } from 'discord.js';
import { REALMS } from '../../cultivation/index.js';
import type { SectRepository } from '../domain/sect.types.js';

export class CultivationLeaderboardService {
  private readonly running=new Set<string>();
  constructor(private readonly repo:SectRepository){}
  markDirty(guildId:string){return this.repo.markLeaderboardDirty(guildId,new Date().toISOString());}
  async view(guild:Guild,limit=20){const rows=await this.repo.cultivationRanks(guild.id);const visible=[];for(const row of rows){const member=await guild.members.fetch(row.userId).catch(()=>null);if(member&&!member.user.bot)visible.push({...row,member});if(visible.length>=limit)break;}return visible;}
  async embed(guild:Guild){const rows=await this.view(guild);const lines=rows.map((r,i)=>{const major=REALMS[r.majorIndex]??REALMS[0]!;const next=REALMS[r.majorIndex+1]??null;const minor=[...major.minors].reverse().find(x=>r.totalXp>=x.minXp)??major.minors[0]!;const suffix=minor.name===major.name?'':` ${minor.name}`;const full=next&&r.totalXp>=next.minXp?' · viên mãn':'';return `**${i+1}.** <@${r.userId}> — **${r.totalXp.toLocaleString('vi-VN')} XP** · ${major.name}${suffix}${full}`;});return new EmbedBuilder().setColor(0xf1c40f).setTitle('🏯 Thiên Bảng Tu Vi').setDescription(lines.join('\n')||'Chưa có tu sĩ nào được ghi nhận.').setFooter({text:'Xếp theo tổng XP; hòa điểm ưu tiên người đạt mốc sớm hơn.'}).setTimestamp();}
  async configure(guildId:string,channelId:string){await this.repo.setLeaderboardConfig(guildId,channelId,true,new Date().toISOString());}
  async disable(guildId:string){await this.repo.setLeaderboardConfig(guildId,null,false,new Date().toISOString());}
  async syncGuild(client:Client,guildId:string){if(this.running.has(guildId))return;this.running.add(guildId);try{const cfg=await this.repo.getLeaderboardConfig(guildId);if(!cfg?.enabled||!cfg.channelId)return;const guild=await client.guilds.fetch(guildId);const channel=await guild.channels.fetch(cfg.channelId).catch(()=>null);if(!channel?.isTextBased()||!('send'in channel))throw new Error('Kênh Thiên Bảng không còn khả dụng.');const embed=await this.embed(guild);const existing=cfg.messageId?await channel.messages.fetch(cfg.messageId).catch(()=>null):null;if(existing)await existing.edit({embeds:[embed]});else{const created=await (channel as any).send({embeds:[embed]});await this.repo.bindLeaderboardMessage(guildId,created.id,new Date().toISOString());await created.pin().catch(()=>undefined);}await this.repo.markLeaderboardUpdated(guildId,new Date().toISOString());}finally{this.running.delete(guildId);}}
  async syncDue(client:Client){const cutoff=new Date(Date.now()-10*60_000).toISOString();for(const cfg of await this.repo.dueLeaderboards(cutoff))await this.syncGuild(client,cfg.guildId).catch(error=>console.error('Leaderboard sync failed:',error));}
}

export class CultivationLeaderboardScheduler{
 private timer:NodeJS.Timeout|null=null;constructor(private readonly service:CultivationLeaderboardService){}
 start(client:Client){void this.service.syncDue(client);this.timer=setInterval(()=>void this.service.syncDue(client),60_000);this.timer.unref();}
 stop(){if(this.timer)clearInterval(this.timer);this.timer=null;}
}
