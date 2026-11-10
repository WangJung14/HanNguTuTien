import {
  ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, ChatInputCommandInteraction,
  EmbedBuilder, escapeMarkdown, Guild, MessageFlags, ModalBuilder, PermissionFlagsBits, SlashCommandBuilder,
  TextInputBuilder, TextInputStyle, ModalSubmitInteraction,
} from 'discord.js';
import { REALMS } from '../domain/cultivation.config.js';
import type { AdminXpAction, CultivationRepository } from '../domain/cultivation.types.js';
import type { RealmService } from '../application/realm.service.js';
import type { DiscordRoleSync } from '../infrastructure/discord-role-sync.js';

const XP_ADJUSTMENT_LIMIT = 10_000;

export const xpAdminDefinition = new SlashCommandBuilder()
  .setName('xpadmin')
  .setDescription('Admin: thưởng công trạng hoặc phạt tu vi thành viên')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addUserOption((option) => option.setName('user').setDescription('Thành viên cần điều chỉnh tu vi').setRequired(true));

export async function handleXpAdminCommand(
  interaction: ChatInputCommandInteraction,
  repository: CultivationRepository,
  realms: RealmService,
): Promise<void> {
  if (!interaction.guild || !hasManageGuild(interaction)) {
    await interaction.reply({ content: 'Lệnh này cần quyền Manage Server.', flags: MessageFlags.Ephemeral });
    return;
  }
  const channelId = await repository.getXpAnnouncementChannel(interaction.guild.id);
  if (!channelId) {
    await interaction.reply({
      content: 'Hãy cấu hình kênh thông báo trước bằng `/xpkenh dat kenh:#kenh` để các khoản thưởng/phạt được công khai.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const announcementChannel = await getAnnouncementChannel(interaction.guild, channelId);
  if (!announcementChannel) {
    await interaction.reply({
      content: 'Kênh thông báo XP chưa tồn tại hoặc bot thiếu quyền xem và gửi tin nhắn ở đó.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const target = interaction.options.getUser('user', true);
  const progress = await realms.getProgress(interaction.guild.id, target.id);
  const embed = new EmbedBuilder()
    .setColor(progress.major.color)
    .setTitle('⚖️ Điều chỉnh công trạng / tu vi')
    .setDescription([
      `Thành viên: <@${target.id}>`,
      `Cảnh giới: **${progress.label}**`,
      `Tu vi hiện tại: **${progress.profile.totalXp.toLocaleString('vi-VN')} XP**`,
      progress.needsBreakthrough ? 'Đã đủ XP, cần vượt Thiên Kiếp để đột phá tiếp.' : '',
      '',
      `Chọn **Thưởng tu vi** để cộng XP hoặc **Phạt tu vi** để trừ XP.`,
      `Mỗi lần tối đa ${XP_ADJUSTMENT_LIMIT.toLocaleString('vi-VN')} XP. Phạt có thể hạ cảnh giới và đồng bộ role.`,
    ].filter(Boolean).join('\n'));
  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`xpadmin:reward:${interaction.user.id}:${target.id}`)
      .setLabel('Thưởng tu vi').setEmoji('🎁').setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`xpadmin:penalty:${interaction.user.id}:${target.id}`)
      .setLabel('Phạt tu vi').setEmoji('⚖️').setStyle(ButtonStyle.Danger),
  );
  await interaction.reply({ embeds: [embed], components: [buttons], flags: MessageFlags.Ephemeral });
}

export async function handleXpAdminButton(interaction: ButtonInteraction): Promise<void> {
  const [, action, actorId, targetId] = interaction.customId.split(':');
  if ((action !== 'reward' && action !== 'penalty') || !actorId || !targetId ||
      interaction.user.id !== actorId || !interaction.guild || !hasManageGuild(interaction)) {
    await interaction.reply({
      content: 'Nút này chỉ dùng được bởi admin đã mở bảng điều chỉnh.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`xpadmin:submit:${action}:${actorId}:${targetId}`)
    .setTitle(action === 'reward' ? 'Thưởng công trạng' : 'Phạt tu vi');
  const amount = new TextInputBuilder()
    .setCustomId('amount').setLabel('Số XP')
    .setPlaceholder(`Nhập số XP (1–${XP_ADJUSTMENT_LIMIT})`)
    .setStyle(TextInputStyle.Short).setMinLength(1).setMaxLength(5).setRequired(true);
  const reason = new TextInputBuilder()
    .setCustomId('reason').setLabel('Lý do (sẽ được thông báo công khai)')
    .setPlaceholder('Ví dụ: đóng góp sự kiện tuần này')
    .setStyle(TextInputStyle.Paragraph).setMaxLength(200).setRequired(true);
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(amount),
    new ActionRowBuilder<TextInputBuilder>().addComponents(reason),
  );
  await interaction.showModal(modal);
}

export async function handleXpAdminModal(
  interaction: ModalSubmitInteraction,
  repository: CultivationRepository,
  realms: RealmService,
  roleSync: DiscordRoleSync,
): Promise<void> {
  const [, , actionValue, actorId, targetId] = interaction.customId.split(':');
  if ((actionValue !== 'reward' && actionValue !== 'penalty') || !actorId || !targetId ||
      interaction.user.id !== actorId || !interaction.guild || !hasManageGuild(interaction)) {
    await interaction.reply({
      content: 'Bạn không còn quyền thực hiện thao tác này.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const amountText = interaction.fields.getTextInputValue('amount').trim();
  const amount = Number(amountText);
  const reason = interaction.fields.getTextInputValue('reason').trim();
  if (!/^\d+$/u.test(amountText) || !Number.isSafeInteger(amount) || amount < 1 || amount > XP_ADJUSTMENT_LIMIT || !reason) {
    await interaction.reply({
      content: `Nhập số XP nguyên từ 1 đến ${XP_ADJUSTMENT_LIMIT.toLocaleString('vi-VN')} và lý do không để trống.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const channelId = await repository.getXpAnnouncementChannel(interaction.guild.id);
  if (!channelId) {
    await interaction.editReply('Kênh thông báo XP chưa được cấu hình. Chưa thực hiện thay đổi.');
    return;
  }
  const announcementChannel = await getAnnouncementChannel(interaction.guild, channelId);
  if (!announcementChannel) {
    await interaction.editReply('Kênh thông báo XP không khả dụng hoặc bot thiếu quyền gửi. Chưa thực hiện thay đổi.');
    return;
  }

  const action = actionValue as AdminXpAction;
  const adjustment = await repository.adjustXpAsAdmin(
    interaction.guild.id, targetId, actorId, interaction.id, action, amount, reason, new Date().toISOString(),
  );
  if (adjustment.duplicate) {
    await interaction.editReply('Điều chỉnh này đã được xử lý trước đó; không cộng/trừ XP hoặc gửi thông báo lần nữa.');
    return;
  }
  let roleStatus = '';
  if (adjustment.newMajorIndex !== adjustment.previousMajorIndex) {
    const result = await roleSync.sync(interaction.guild, targetId, adjustment.newMajorIndex);
    roleStatus = result.synced ? ' Role cảnh giới đã được đồng bộ.' : ` Cần admin kiểm tra role: ${result.message}`;
  }

  const actionText = action === 'reward' ? 'thưởng công trạng' : 'phạt tu vi';
  const direction = action === 'reward' ? '+' : '-';
  const realmChange = adjustment.newMajorIndex !== adjustment.previousMajorIndex
    ? ` Cảnh giới: **${REALMS[adjustment.previousMajorIndex]!.name} → ${REALMS[adjustment.newMajorIndex]!.name}**.`
    : '';
  try {
    await announcementChannel.send({
      content: [
        `⚖️ <@${targetId}> được admin <@${actorId}> ${actionText} **${direction}${adjustment.amount.toLocaleString('vi-VN')} XP**.`,
        `Tu vi: **${adjustment.previousTotalXp.toLocaleString('vi-VN')} → ${adjustment.newTotalXp.toLocaleString('vi-VN')} XP**.`,
        `Lý do: ${escapeMarkdown(reason)}.${realmChange}`,
      ].join('\n'),
      allowedMentions: { users: [...new Set([targetId, actorId])], parse: [] },
    });
  } catch (error) {
    console.error('Could not send admin XP announcement:', {
      guildId: interaction.guild.id, targetId, actorId, adjustmentId: adjustment.id, error,
    });
    await interaction.editReply(`Đã lưu điều chỉnh XP, nhưng không gửi được thông báo công khai.${roleStatus}`);
    return;
  }

  await interaction.editReply(
    `Đã ${actionText} <@${targetId}> ${direction}${adjustment.amount.toLocaleString('vi-VN')} XP. ` +
    `Tu vi hiện tại: ${adjustment.newTotalXp.toLocaleString('vi-VN')} XP.${realmChange}${roleStatus}`,
  );
}

function hasManageGuild(interaction: ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction): boolean {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
}

async function getAnnouncementChannel(guild: Guild, channelId: string) {
  const channel = await guild.channels.fetch(channelId);
  if (!channel || !channel.isTextBased() || !('permissionsFor' in channel) ||
      !('send' in channel) || typeof channel.send !== 'function') return null;
  const botMember = guild.members.me ?? await guild.members.fetchMe();
  const permissions = channel.permissionsFor(botMember);
  if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) return null;
  return channel;
}
