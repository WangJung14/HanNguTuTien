import { Events, type Client, type VoiceState } from 'discord.js';
import type { MeditationService } from '../application/meditation.service.js';
import { MEDITATION_CONFIG } from '../domain/meditation.config.js';

export function attachMeditationRunner(client:Client,service:MeditationService):()=>void {
  const reconcile=()=>{service.endAll();for(const guild of client.guilds.cache.values())for(const state of guild.voiceStates.cache.values())
    if(state.channelId===service.getChannel(guild.id)&&state.member&&!state.member.user.bot)service.start(guild.id,state.member.id,state.channelId!);};
  const handle=(oldState:VoiceState,newState:VoiceState)=>{
    const member=newState.member??oldState.member; if(!member||member.user.bot)return;
    if(oldState.channelId===newState.channelId)return;
    service.end(newState.guild.id,member.id);
    if(newState.channelId===service.getChannel(newState.guild.id))service.start(newState.guild.id,member.id,newState.channelId!);
  };
  client.on(Events.VoiceStateUpdate,handle);
  client.once(Events.ClientReady,reconcile);
  const disconnect=()=>service.endAll(); const resume=()=>reconcile();
  client.on(Events.ShardDisconnect,disconnect); client.on(Events.ShardResume,resume);
  const timer=setInterval(()=>{if(client.isReady())service.processDue();},MEDITATION_CONFIG.schedulerMs); timer.unref();
  return()=>{clearInterval(timer);client.off(Events.VoiceStateUpdate,handle);client.off(Events.ShardDisconnect,disconnect);client.off(Events.ShardResume,resume);service.endAll();};
}

