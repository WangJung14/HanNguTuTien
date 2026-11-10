import { Events, type Client, type VoiceState } from 'discord.js';
import type { MeditationService } from '../application/meditation.service.js';
import { MEDITATION_CONFIG } from '../domain/meditation.config.js';

export function attachMeditationRunner(client:Client,service:Pick<MeditationService,'endAll'|'getChannel'|'start'|'end'|'processDue'>):()=>void {
  const reconcile=async()=>{await service.endAll();for(const guild of client.guilds.cache.values()){
    const channelId=await service.getChannel(guild.id);
    for(const state of guild.voiceStates.cache.values())
      if(state.channelId===channelId&&state.member&&!state.member.user.bot)await service.start(guild.id,state.member.id,state.channelId!);
  }};
  const handle=async(oldState:VoiceState,newState:VoiceState)=>{
    const member=newState.member??oldState.member; if(!member||member.user.bot)return;
    if(oldState.channelId===newState.channelId)return;
    await service.end(newState.guild.id,member.id);
    if(newState.channelId===await service.getChannel(newState.guild.id))await service.start(newState.guild.id,member.id,newState.channelId!);
  };
  const safely=(operation:()=>Promise<unknown>)=>{void operation().catch(error=>console.error('Meditation runner failed:',error));};
  const voiceUpdate=(oldState:VoiceState,newState:VoiceState)=>safely(()=>handle(oldState,newState));
  client.on(Events.VoiceStateUpdate,voiceUpdate);
  client.once(Events.ClientReady,()=>safely(reconcile));
  const disconnect=()=>safely(()=>service.endAll()); const resume=()=>safely(reconcile);
  client.on(Events.ShardDisconnect,disconnect); client.on(Events.ShardResume,resume);
  let processing=false;
  const timer=setInterval(()=>{if(client.isReady()&&!processing){processing=true;safely(async()=>{try{return await service.processDue();}finally{processing=false;}});}},MEDITATION_CONFIG.schedulerMs); timer.unref();
  return()=>{clearInterval(timer);client.off(Events.VoiceStateUpdate,voiceUpdate);client.off(Events.ShardDisconnect,disconnect);client.off(Events.ShardResume,resume);safely(()=>service.endAll());};
}
