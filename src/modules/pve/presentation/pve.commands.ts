import {
  ChatInputCommandInteraction, EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder,
} from 'discord.js';
import type { PveService } from '../application/pve.service.js';
import type { PveScheduler } from '../infrastructure/pve-scheduler.js';
import type { HskLevel } from '../domain/pve.types.js';
import { bossLobby, pveQuestion } from './pve-ui.js';

const levels = [
  { name: 'HSK 1', value: 'HSK1' }, { name: 'HSK 2', value: 'HSK2' }, { name: 'HSK 3', value: 'HSK3' },
] as const;
export const bicanhDefinition = new SlashCommandBuilder().setName('bicanh').setDescription('🏯 Thí Luyện Bí Cảnh')
  .addSubcommand((sub) => sub.setName('vao').setDescription('Tiến vào Bí Cảnh')
    .addStringOption((option) => option.setName('capdo').setDescription('Cấp HSK').setRequired(true).addChoices(...levels)))
  .addSubcommand((sub) => sub.setName('lichsu').setDescription('Lịch sử Bí Cảnh'));
export const bossDefinition = new SlashCommandBuilder().setName('boss').setDescription('👹 Boss HSK co-op')
  .addSubcommand((sub) => sub.setName('xem').setDescription('Xem sự kiện và Boss trong channel'))
  .addSubcommand((sub) => sub.setName('thamgia').setDescription('Tham gia Boss đang chờ'))
  .addSubcommand((sub) => sub.setName('batdau').setDescription('Chủ phòng/admin bắt đầu'))
  .addSubcommand((sub) => sub.setName('bangxep').setDescription('Bảng đóng góp sát thương'))
  .addSubcommand((sub) => sub.setName('mo').setDescription('Admin mở Boss')
    .addStringOption((option) => option.setName('capdo').setDescription('Cấp Boss').setRequired(true).addChoices(...levels)))
  .addSubcommand((sub) => sub.setName('huy').setDescription('Admin hủy Boss'));

export async function handleBicanh(i: ChatInputCommandInteraction, service: PveService, scheduler: PveScheduler) {
  if (!i.guildId || !i.channelId) {
    await i.reply({ content: 'Dùng lệnh trong server.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (i.options.getSubcommand() === 'lichsu') {
    const rows = await service.secretHistory(i.guildId, i.user.id);
    await i.reply({
      embeds: [new EmbedBuilder().setColor(0x16a085).setTitle('📜 Lịch sử Bí Cảnh')
        .setDescription(rows.length
          ? rows.map((row) => `• ${row.level} · ${row.status} · ${row.runCorrect}/15 · ${row.score} điểm${row.xpAwarded ? ` · +${row.xpAwarded} XP` : ''}`).join('\n')
          : 'Chưa có lịch sử.')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  const name = i.member && 'displayName' in i.member ? i.member.displayName : i.user.displayName;
  const run = await service.createSecret(
    i.guildId, i.channelId, i.user.id, name, i.options.getString('capdo', true) as HskLevel,
  );
  try {
    const question = await service.current(run.id);
    const message = await i.editReply(pveQuestion(run, question));
    await service.bind(run.id, message.id);
    await service.openRound(run.id, 0, new Date());
    scheduler.scheduleSecret(run.id, 0, (payload) => i.editReply(payload));
  } catch (error) {
    await service.cancelUnsafe(run.id);
    throw error;
  }
}

export async function handleBoss(i: ChatInputCommandInteraction, service: PveService) {
  if (!i.guildId || !i.channelId) {
    await i.reply({ content: 'Dùng lệnh trong server.', flags: MessageFlags.Ephemeral });
    return;
  }
  const sub = i.options.getSubcommand();
  const [run, leaderboard] = await Promise.all([
    service.findBoss(i.guildId, i.channelId),
    sub === 'bangxep' ? service.bossLeaderboard(i.guildId) : Promise.resolve(null),
  ]);
  const admin = i.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
  const name = i.member && 'displayName' in i.member ? i.member.displayName : i.user.displayName;

  if (sub === 'xem') {
    const event = service.event();
    const text = `Cửa sổ: **Thứ Bảy 19:00 → Chủ nhật 23:59** (Việt Nam)\nTuần sự kiện: **${event.weekKey}**\nHiện tại: **${event.open ? 'Đang mở' : 'Đang đóng'}**\n${run ? `Boss channel: **${run.status} · ${run.level}**` : 'Channel chưa có Boss.'}`;
    await i.reply({
      embeds: [new EmbedBuilder().setColor(0x8e44ad).setTitle('👹 Lịch Boss HSK').setDescription(text)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (sub === 'bangxep') {
    const rows = leaderboard!;
    await i.reply({
      embeds: [new EmbedBuilder().setColor(0xc0392b).setTitle('⚔️ Bảng sát thương Boss')
        .setDescription(rows.length
          ? rows.map((row, index) => `${index + 1}. **${row.displayName}** — ${row.damage} sát thương · ${row.correctCount} đúng`).join('\n')
          : 'Chưa có dữ liệu.')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (sub === 'mo') {
    if (!admin) {
      await i.reply({ content: 'Cần quyền Manage Server.', flags: MessageFlags.Ephemeral });
      return;
    }
    await i.deferReply();
    const boss = await service.openBoss(
      i.guildId, i.channelId, i.user.id, name, i.options.getString('capdo', true) as HskLevel,
    );
    try {
      const message = await i.editReply(bossLobby(boss, await service.players(boss.id)));
      await service.bind(boss.id, message.id);
    } catch (error) {
      await service.cancelUnsafe(boss.id);
      throw error;
    }
    return;
  }
  if (!run) {
    await i.reply({ content: 'Channel không có Boss đang chờ/hoạt động.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (sub === 'thamgia') {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const players = await service.joinBoss(run.id, i.guildId, i.user.id, name);
    await editPublic(i, run.messageId!, bossLobby(run, players));
    await i.editReply('✅ Đã tham gia diệt Boss.');
    return;
  }
  if (sub === 'batdau') {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const active = await service.startBoss(run.id, i.guildId, i.user.id, admin);
    const question = await service.current(run.id);
    try {
      await editPublic(i, run.messageId!, pveQuestion(active, question));
      await service.openRound(run.id, 0, new Date());
    } catch (error) {
      await service.cancelUnsafe(run.id);
      throw error;
    }
    await i.editReply('⚔️ Boss chiến bắt đầu!');
    return;
  }
  if (!admin) {
    await i.reply({ content: 'Chỉ admin Manage Server được hủy Boss.', flags: MessageFlags.Ephemeral });
    return;
  }
  await service.cancel(run.id, i.guildId, i.user.id, true);
  await editPublic(i, run.messageId!, { content: '🛑 Boss HSK đã bị hủy.', embeds: [], components: [] });
  await i.reply({ content: 'Đã hủy.', flags: MessageFlags.Ephemeral });
}

async function editPublic(i: ChatInputCommandInteraction, id: string, payload: unknown) {
  if (i.channel?.isTextBased() && 'messages' in i.channel) {
    await (await i.channel.messages.fetch(id)).edit(payload as Parameters<typeof i.channel.messages.fetch>[0] extends never ? never : any);
  }
}
