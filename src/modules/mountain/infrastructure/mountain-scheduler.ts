import{Events,type Client,type InteractionEditReplyOptions}from'discord.js';
import type{MountainMatchService}from'../application/match.service.js';
import{question,results}from'../presentation/mountain-ui.js';
export class MountainScheduler{
 private solo=new Map<string,NodeJS.Timeout>();private timer:NodeJS.Timeout|null=null;private ticking=false;
 private client!:Client;
 constructor(private readonly service:MountainMatchService){}
 start(client:Client){this.client=client;this.client.once(Events.ClientReady,()=>this.service.cancelActiveOnRestart());this.client.on(Events.ShardDisconnect,this.onDisconnect);this.timer=setInterval(()=>void this.tick(),500);this.timer.unref();}
 stop(){if(this.timer)clearInterval(this.timer);for(const t of this.solo.values())clearTimeout(t);this.solo.clear();this.client.off(Events.ShardDisconnect,this.onDisconnect);}
 scheduleSolo(id:string,index:number,edit:(payload:InteractionEditReplyOptions)=>Promise<unknown>){this.cancelSolo(id);const t=setTimeout(()=>void this.timeoutSolo(id,index,edit),10_050);t.unref();this.solo.set(id,t);}
 cancelSolo(id:string){const t=this.solo.get(id);if(t)clearTimeout(t);this.solo.delete(id);}
 private onDisconnect=()=>{this.service.cancelActiveOnRestart();};
 private async timeoutSolo(id:string,index:number,edit:(payload:InteractionEditReplyOptions)=>Promise<unknown>){try{const m=await this.service.closeRound(id,index);if(m.status==='COMPLETED'){await edit(results(m,await this.service.players(id)));this.solo.delete(id);return;}const r=await this.service.currentRound(id);await edit(question(m,r));await this.service.openRound(id,r.roundIndex,new Date());this.scheduleSolo(id,r.roundIndex,edit);}catch(error){console.error('Mountain solo round failed:',error);this.solo.delete(id);}}
 private async tick(){if(this.ticking)return;this.ticking=true;try{await this.service.expireWaiting();for(const m of await this.service.due()){if(m.kind!=='multi')continue;try{const updated=await this.service.closeRound(m.id,m.currentRound);const channel=await this.client.channels.fetch(m.channelId);if(!channel?.isTextBased()||!('messages'in channel)||!m.messageId)throw new Error('Message unavailable');const message=await channel.messages.fetch(m.messageId);if(updated.status==='COMPLETED'){await message.edit(results(updated,await this.service.players(m.id)));continue;}const r=await this.service.currentRound(m.id);await message.edit(question(updated,r));await this.service.openRound(m.id,r.roundIndex,new Date());}catch(error){console.error('Mountain round scheduler failed:',error);await this.service.cancelUnsafe(m.id);}}}finally{this.ticking=false;}}
}
