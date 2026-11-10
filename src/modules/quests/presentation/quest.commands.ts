import { ChannelType, ChatInputCommandInteraction, EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { QUESTS } from '../domain/quest.config.js';
import type { QuestService } from '../application/quest.service.js';
import type { MeditationService } from '../../meditation/index.js';

export const nhiemvuDefinition=new SlashCommandBuilder().setName('nhiemvu').setDescription('📜 Xem nhiệm vụ tu luyện hằng ngày');
export const bequanDefinition=new SlashCommandBuilder().setName('bequan').setDescription('🧘 Xem trạng thái và thành quả Bế Quan');
export const diemdanhDefinition=new SlashCommandBuilder().setName('diemdanh').setDescription('🔥 Xem chuỗi ngày học chính tả');
export const bequancauhinhDefinition=new SlashCommandBuilder().setName('bequancauhinh').setDescription('Cấu hình phòng Bế Quan')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand(s=>s.setName('kenh').setDescription('Chọn Voice Channel Bế Quan').addChannelOption(o=>o.setName('voice_channel').setDescription('Phòng Bế Quan').addChannelTypes(ChannelType.GuildVoice).setRequired(true)))
  .addSubcommand(s=>s.setName('tat').setDescription('Ngừng tính Bế Quan trong server'));

type QuestServiceApi=Pick<QuestService,'getDaily'|'getStreak'|'activityDays'>;
type MeditationServiceApi=Pick<MeditationService,'status'|'setChannel'|'start'>;
export async function handleNhiemvu(i:ChatInputCommandInteraction,service:QuestServiceApi){
  if(!i.guildId)return void await i.reply({content:'Dùng lệnh trong server.',flags:MessageFlags.Ephemeral});
  const rows=await service.getDaily(i.guildId,i.user.id);
  const lines=rows.map(row=>{const cfg=QUESTS[row.questKey];const done=Boolean(row.completedAt);return `${done?'✅':'▫️'} **${cfg.name}** — ${row.progress}/${cfg.target} ${cfg.unit}\n└ +${cfg.reward} XP${done?` · đã thưởng ${row.xpAwarded} XP`:''}`;});
  await i.reply({embeds:[new EmbedBuilder().setColor(0x27ae60).setTitle('📜 Nhiệm Vụ Tu Luyện Hôm Nay').setDescription(lines.join('\n'))],flags:MessageFlags.Ephemeral});
}
export async function handleBequan(i:ChatInputCommandInteraction,service:MeditationServiceApi){
  if(!i.guildId)return void await i.reply({content:'Dùng lệnh trong server.',flags:MessageFlags.Ephemeral}); const s=await service.status(i.guildId,i.user.id);
  await i.reply({embeds:[new EmbedBuilder().setColor(0x3498db).setTitle('🧘 Bế Quan').setDescription([
    `Thời gian hợp lệ hôm nay: **${s.minutes} phút**`,`XP Bế Quan đã nhận: **${s.xp}/60**`,`Giới hạn nguồn còn lại: **${s.remainingXp} XP**`,
    s.active?`Trạng thái: **Đang nhập định** tại <#${s.active.channelId}>\nMốc tiếp theo: <t:${Math.floor(Date.parse(s.active.nextRewardAt)/1000)}:R>`:'Trạng thái: Chưa Bế Quan',
    s.channelId?`Phòng được cấu hình: <#${s.channelId}>`:'Server chưa cấu hình phòng Bế Quan.',
  ].join('\n'))],flags:MessageFlags.Ephemeral});
}
export async function handleDiemdanh(i:ChatInputCommandInteraction,service:QuestServiceApi){
  if(!i.guildId)return void await i.reply({content:'Dùng lệnh trong server.',flags:MessageFlags.Ephemeral});const s=await service.getStreak(i.guildId,i.user.id);const days=await service.activityDays(i.guildId,i.user.id);
  await i.reply({embeds:[new EmbedBuilder().setColor(0xe67e22).setTitle('🔥 Nhật Ký Tu Học').setDescription(`Streak hiện tại: **${s.currentStreak} ngày**\nKỷ lục: **${s.longestStreak} ngày**\nNgày học gần nhất: **${s.lastActiveDate??'Chưa có'}**`).addFields({name:'Hoạt động gần đây',value:days.length?days.join(' · '):'Chưa hoàn thành phiên chính tả.'})],flags:MessageFlags.Ephemeral});
}
export async function handleBequanConfig(i:ChatInputCommandInteraction,service:MeditationServiceApi){
  if(!i.guildId||!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild))return void await i.reply({content:'Bạn cần quyền Manage Server.',flags:MessageFlags.Ephemeral});
  if(i.options.getSubcommand()==='tat'){await service.setChannel(i.guildId,null);await i.reply({content:'⏹️ Đã tắt Bế Quan và kết thúc các phiên đang chạy.',flags:MessageFlags.Ephemeral});return;}
  const channel=i.options.getChannel('voice_channel',true);await service.setChannel(i.guildId,channel.id);
  for(const state of i.guild?.voiceStates.cache.values()??[])if(state.channelId===channel.id&&state.member&&!state.member.user.bot)await service.start(i.guildId,state.member.id,channel.id);
  await i.reply({content:`✅ Đã chọn ${channel} làm phòng Bế Quan.`,flags:MessageFlags.Ephemeral});
}
