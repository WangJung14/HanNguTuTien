import { PermissionFlagsBits, type Guild } from 'discord.js';
import type { CultivationRepository } from '../domain/cultivation.types.js';

export class DiscordRoleSync {
  constructor(private readonly repository: CultivationRepository) {}

  async sync(guild: Guild, userId: string, majorIndex: number): Promise<{ synced: boolean; message: string }> {
    const now = new Date().toISOString();
    try {
      const mappings = this.repository.getRealmRoles(guild.id);
      const targetId = mappings.get(majorIndex);
      if (!targetId) {
        this.repository.setRoleSyncPending(guild.id, userId, false, now);
        return { synced: true, message: 'Server chưa ánh xạ role cho cảnh giới này.' };
      }
      const bot = guild.members.me ?? await guild.members.fetchMe();
      if (!bot.permissions.has(PermissionFlagsBits.ManageRoles)) throw new Error('Bot thiếu quyền Manage Roles.');
      const target = guild.roles.cache.get(targetId) ?? await guild.roles.fetch(targetId);
      if (!target) throw new Error('Role cảnh giới đã bị xóa khỏi server.');
      if (bot.roles.highest.comparePositionTo(target) <= 0) throw new Error('Role của bot phải nằm cao hơn role cảnh giới.');
      const member = await guild.members.fetch(userId);
      const managedIds = [...mappings.values()].filter((id) => id !== targetId && member.roles.cache.has(id));
      if (managedIds.length) await member.roles.remove(managedIds, 'Đồng bộ cảnh giới tu tiên');
      if (!member.roles.cache.has(targetId)) await member.roles.add(targetId, 'Đồng bộ cảnh giới tu tiên');
      this.repository.setRoleSyncPending(guild.id, userId, false, now);
      return { synced: true, message: `Đã đồng bộ role ${target.name}.` };
    } catch (error) {
      this.repository.setRoleSyncPending(guild.id, userId, true, now);
      return { synced: false, message: error instanceof Error ? error.message : 'Discord API lỗi khi đồng bộ role.' };
    }
  }
}
