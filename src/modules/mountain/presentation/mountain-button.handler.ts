import{ButtonInteraction,MessageFlags}from'discord.js';
import type{MountainMatchService}from'../application/match.service.js';
import type{MountainScheduler}from'../infrastructure/mountain-scheduler.js';
import{lobby,question,results}from'./mountain-ui.js';
import{MountainError}from'../domain/mountain.types.js';
export async function handleMountainButton(i:ButtonInteraction,service:MountainMatchService,scheduler:MountainScheduler){const received=new Date();const[,action,id,rawRound,rawOption]=i.customId.split(':');if(!i.guildId||!id)throw new MountainError('Nút Leo Núi không hợp lệ.');
 if(action==='join'){const m=service.findChannel(i.guildId,i.channelId);if(!m||m.id!==id)throw new MountainError('Phòng không còn hoạt động.');const name=i.member&&'displayName'in i.member?i.member.displayName:i.user.displayName;service.join(id,i.guildId,i.user.id,name);await i.deferUpdate();await i.editReply(lobby(m,service.players(id)));return;}
 const round=Number(rawRound),option=Number(rawOption);const m=service.getOwned(id,i.guildId,i.user.id,i.message.id);if(!Number.isSafeInteger(round)||!Number.isSafeInteger(option))throw new MountainError('Đáp án không hợp lệ.');
 if(m.kind==='multi'){const answer=service.answer(id,round,i.user.id,option,received);await i.reply({content:`✅ Đã khóa đáp án · ${answer.elapsedMs}ms. Chờ hết vòng để xem kết quả.`,flags:MessageFlags.Ephemeral});return;}
 await i.deferUpdate();service.answer(id,round,i.user.id,option,received);scheduler.cancelSolo(id);const updated=service.closeRound(id,round,received);if(updated.status==='COMPLETED'){await i.editReply(results(updated,service.players(id)));return;}const next=service.currentRound(id);await i.editReply(question(updated,next));service.openRound(id,next.roundIndex,new Date());scheduler.scheduleSolo(id,next.roundIndex,p=>i.editReply(p));}
