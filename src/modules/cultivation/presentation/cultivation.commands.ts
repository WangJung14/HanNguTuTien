import {
  ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits, SlashCommandBuilder,
} from 'discord.js';
import { REALMS } from '../domain/cultivation.config.js';
import type { CultivationRepository } from '../domain/cultivation.types.js';
import type { BreakthroughService } from '../application/breakthrough.service.js';
import type { RealmService } from '../application/realm.service.js';
import type { XpService } from '../application/xp.service.js';
import type { DiscordRoleSync } from '../infrastructure/discord-role-sync.js';
import { buildBreakthroughQuestion, buildHistoryEmbed, buildProfileEmbed } from './cultivation-ui.js';

export const tuviDefinition = new SlashCommandBuilder().setName('tuvi').setDescription('🌀 Xem tu vi và cảnh giới hiện tại');
export const dotphaDefinition = new SlashCommandBuilder().setName('dotpha').setDescription('⚡ Khiêu chiến Thiên Kiếp để đột phá đại cảnh giới')
  .addIntegerOption((o) => o.setName('botu').setDescription('ID bộ từ cá nhân có ít nhất 10 từ hợp lệ').setRequired(true).setMinValue(1));
export const lichsutuviDefinition = new SlashCommandBuilder().setName('lichsutuvi').setDescription('📜 Xem lịch sử nhận XP và Thiên Kiếp');

const realmChoices = REALMS.map((realm, index) => ({ name: realm.name, value: index }));
export const canhgioiroleDefinition = new SlashCommandBuilder().setName('canhgioirole')
  .setDescription('Quản lý ánh xạ role cảnh giới').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addSubcommand((s) => s.setName('gan').setDescription('Gán role cho một đại cảnh giới')
    .addIntegerOption((o) => o.setName('canhgioi').setDescription('Đại cảnh giới').setRequired(true).addChoices(...realmChoices))
    .addRoleOption((o) => o.setName('role').setDescription('Discord role').setRequired(true)))
  .addSubcommand((s) => s.setName('go').setDescription('Gỡ ánh xạ role cảnh giới')
    .addIntegerOption((o) => o.setName('canhgioi').setDescription('Đại cảnh giới').setRequired(true).addChoices(...realmChoices)))
  .addSubcommand((s) => s.setName('dongbo').setDescription('Thử đồng bộ role lại cho thành viên')
    .addUserOption((o) => o.setName('thanhvien').setDescription('Thành viên cần đồng bộ').setRequired(true)));

export async function handleTuvi(interaction: ChatInputCommandInteraction, realms: RealmService) {
  if (!interaction.guildId) return void await interaction.reply({ content: 'Dùng lệnh này trong server.', flags: MessageFlags.Ephemeral });
  await interaction.reply({ embeds: [buildProfileEmbed(realms.getProgress(interaction.guildId, interaction.user.id))], flags: MessageFlags.Ephemeral });
}
export async function handleLichsu(interaction: ChatInputCommandInteraction, xp: XpService, breakthrough: BreakthroughService) {
  if (!interaction.guildId) return void await interaction.reply({ content: 'Dùng lệnh này trong server.', flags: MessageFlags.Ephemeral });
  await interaction.reply({ embeds: [buildHistoryEmbed(xp.history(interaction.guildId, interaction.user.id), breakthrough.history(interaction.guildId, interaction.user.id))], flags: MessageFlags.Ephemeral });
}
export async function handleDotpha(interaction: ChatInputCommandInteraction, service: BreakthroughService) {
  if (!interaction.guildId) return void await interaction.reply({ content: 'Dùng lệnh này trong server.', flags: MessageFlags.Ephemeral });
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const started = await service.start(interaction.guildId, interaction.user.id, interaction.options.getInteger('botu', true));
  const response = await interaction.editReply(buildBreakthroughQuestion(started.attempt, started.audio));
  service.bindMessage(started.attempt.id, response.id);
}
export async function handleRealmRole(interaction: ChatInputCommandInteraction, repository: CultivationRepository,
  realms: RealmService, roleSync: DiscordRoleSync) {
  if (!interaction.guild) return void await interaction.reply({ content: 'Dùng lệnh này trong server.', flags: MessageFlags.Ephemeral });
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) return void await interaction.reply({ content: 'Bạn cần quyền Manage Roles.', flags: MessageFlags.Ephemeral });
  const sub = interaction.options.getSubcommand();
  if (sub === 'gan') {
    const index = interaction.options.getInteger('canhgioi', true);
    const selectedRole = interaction.options.getRole('role', true);
    const role = interaction.guild.roles.cache.get(selectedRole.id) ?? await interaction.guild.roles.fetch(selectedRole.id);
    if (!role) return void await interaction.reply({ content: 'Không tìm thấy role trong server.', flags: MessageFlags.Ephemeral });
    if (role.managed) return void await interaction.reply({ content: 'Không thể dùng role do integration quản lý.', flags: MessageFlags.Ephemeral });
    const botMember = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) return void await interaction.reply({ content: 'Bot thiếu quyền Manage Roles.', flags: MessageFlags.Ephemeral });
    if (botMember.roles.highest.comparePositionTo(role) <= 0) return void await interaction.reply({ content: 'Role của bot phải nằm cao hơn role cảnh giới.', flags: MessageFlags.Ephemeral });
    repository.setRealmRole(interaction.guild.id, index, role.id, new Date().toISOString());
    await interaction.reply({ content: `✅ Đã ánh xạ **${REALMS[index]!.name}** → ${role}.`, flags: MessageFlags.Ephemeral }); return;
  }
  if (sub === 'go') {
    const index = interaction.options.getInteger('canhgioi', true);
    repository.removeRealmRole(interaction.guild.id, index);
    await interaction.reply({ content: `Đã gỡ ánh xạ role của **${REALMS[index]!.name}**.`, flags: MessageFlags.Ephemeral }); return;
  }
  const user = interaction.options.getUser('thanhvien', true);
  const progress = realms.getProgress(interaction.guild.id, user.id);
  const result = await roleSync.sync(interaction.guild, user.id, progress.profile.majorIndex);
  await interaction.reply({ content: `${result.synced ? '✅' : '⚠️'} ${result.message}`, flags: MessageFlags.Ephemeral });
}
