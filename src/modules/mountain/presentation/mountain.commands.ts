import{ChatInputCommandInteraction,EmbedBuilder,MessageFlags,PermissionFlagsBits,SlashCommandBuilder}from'discord.js';
import type{MountainMatchService}from'../application/match.service.js';
import type{MountainScheduler}from'../infrastructure/mountain-scheduler.js';
import{history,leaderboard,lobby,question}from'./mountain-ui.js';
const deck=(s:any)=>s.addIntegerOption((o:any)=>o.setName('botu').setDescription('ID bộ từ cá nhân hoặc công khai').setRequired(true).setMinValue(1));
export const leonuiDefinition=new SlashCommandBuilder().setName('leonui').setDescription('🏔️ Vấn Đỉnh Hán Ngữ')
 .addSubcommand(s=>deck(s.setName('solo').setDescription('Độc Hành Vấn Đỉnh 10 câu')))
 .addSubcommand(s=>deck(s.setName('tao').setDescription('Tạo phòng Quần Hùng Tranh Bá')))
 .addSubcommand(s=>s.setName('thamgia').setDescription('Tham gia phòng đang chờ trong channel'))
 .addSubcommand(s=>s.setName('batdau').setDescription('Chủ phòng bắt đầu trận'))
 .addSubcommand(s=>s.setName('huy').setDescription('Chủ phòng hoặc admin hủy trận'))
 .addSubcommand(s=>s.setName('bangxep').setDescription('Bảng xếp hạng server'))
 .addSubcommand(s=>s.setName('lichsu').setDescription('Lịch sử cá nhân'));
export async function handleLeonui(i:ChatInputCommandInteraction,service:MountainMatchService,scheduler:MountainScheduler){if(!i.guildId||!i.channelId)return void await i.reply({content:'Dùng lệnh trong server.',flags:MessageFlags.Ephemeral});const sub=i.options.getSubcommand(),name=i.member&&'displayName'in i.member?i.member.displayName:i.user.displayName;
 if(sub==='solo'){await i.deferReply({flags:MessageFlags.Ephemeral});const m=await service.create(i.guildId,i.channelId,i.user.id,name,i.options.getInteger('botu',true),'solo');const r=await service.currentRound(m.id);const msg=await i.editReply(question(m,r));await service.bind(m.id,msg.id);await service.openRound(m.id,0,new Date());scheduler.scheduleSolo(m.id,0,p=>i.editReply(p));return;}
 if(sub==='tao'){await i.deferReply();const m=await service.create(i.guildId,i.channelId,i.user.id,name,i.options.getInteger('botu',true),'multi');const msg=await i.editReply(lobby(m,await service.players(m.id)));await service.bind(m.id,msg.id);return;}
 if(sub==='bangxep')return void await i.reply({embeds:[leaderboard(await service.leaderboard(i.guildId))],flags:MessageFlags.Ephemeral});
 if(sub==='lichsu')return void await i.reply({embeds:[history(await service.history(i.guildId,i.user.id))],flags:MessageFlags.Ephemeral});
 const m=await service.findChannel(i.guildId,i.channelId);if(!m)return void await i.reply({content:'Channel này không có phòng Multiplayer đang hoạt động.',flags:MessageFlags.Ephemeral});
 if(sub==='thamgia'){await i.deferReply({flags:MessageFlags.Ephemeral});await service.join(m.id,i.guildId,i.user.id,name);await refresh(i,m.id,service,lobby);return void await i.editReply('✅ Đã tham gia phòng.');}
 if(sub==='batdau'){await i.deferReply({flags:MessageFlags.Ephemeral});const active=await service.startMulti(m.id,i.guildId,i.user.id);const r=await service.currentRound(m.id);await refreshPayload(i,active.messageId!,question(active,r));await service.openRound(m.id,0,new Date());await i.editReply('⚔️ Trận đã bắt đầu!');return;}
 await i.deferReply({flags:MessageFlags.Ephemeral});const admin=i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)??false;await service.cancel(m.id,i.guildId,i.user.id,admin);await refreshPayload(i,m.messageId!,{content:'🛑 Trận Vấn Đỉnh đã bị hủy.',embeds:[],components:[]});await i.editReply('Đã hủy trận.');}
async function refresh(i:ChatInputCommandInteraction,id:string,service:MountainMatchService,builder:typeof lobby){const m=await service.findChannel(i.guildId!,i.channelId!);if(m?.messageId)await refreshPayload(i,m.messageId,builder(m,await service.players(id)));}
async function refreshPayload(i:ChatInputCommandInteraction,messageId:string,payload:any){if(i.channel?.isTextBased()&&'messages'in i.channel){const msg=await i.channel.messages.fetch(messageId);await msg.edit(payload);}}
