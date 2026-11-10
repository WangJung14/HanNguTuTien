import {
  ActionRowBuilder, ButtonInteraction, MessageFlags, ModalBuilder, ModalSubmitInteraction, TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import type { BreakthroughService } from '../application/breakthrough.service.js';
import type { DiscordRoleSync } from '../infrastructure/discord-role-sync.js';
import { CultivationError } from '../domain/cultivation.types.js';
import { REALMS } from '../domain/cultivation.config.js';
import { buildBreakthroughAnswered, buildBreakthroughQuestion, buildBreakthroughResult } from './cultivation-ui.js';

export async function handleCultivationButton(interaction: ButtonInteraction, service: BreakthroughService,
  roleSync: DiscordRoleSync) {
  const [, action, id, rawIndex] = interaction.customId.split(':');
  const index = Number(rawIndex);
  if (!interaction.guildId || !id || !Number.isSafeInteger(index)) throw new CultivationError('Nút Thiên Kiếp không hợp lệ.');
  const value = await service.getOwned(id, interaction.guildId, interaction.user.id, interaction.message.id);
  if (value.currentIndex !== index) throw new CultivationError('Câu Thiên Kiếp này đã cũ.');
  if (action === 'answer') {
    const modal = new ModalBuilder().setCustomId(`cultivation:submit:${id}:${index}`).setTitle(`Thiên Kiếp ${index + 1}/10`)
      .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder()
        .setCustomId('answer').setLabel('Nhập chữ Hán vừa nghe').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100)));
    await interaction.showModal(modal); return;
  }
  await interaction.deferUpdate();
  if (action === 'replay') {
    const audio = await service.replay(value);
    await interaction.editReply(buildBreakthroughQuestion(value, audio)); return;
  }
  if (action === 'next') {
    const advanced = await service.advance(value);
    if (advanced.attempt.status !== 'active') {
      const message = buildBreakthroughResult(advanced.attempt, advanced.realm);
      if (advanced.attempt.status === 'passed' && interaction.guild) {
        const sync = await roleSync.sync(interaction.guild, interaction.user.id, advanced.attempt.toMajor);
        message.content = `${sync.synced ? '✅' : '⚠️'} ${sync.message}`;
      }
      await interaction.editReply(message); return;
    }
    if (!advanced.audio) throw new Error('Missing breakthrough audio.');
    await interaction.editReply(buildBreakthroughQuestion(advanced.attempt, advanced.audio)); return;
  }
  throw new CultivationError('Nút Thiên Kiếp không được hỗ trợ.');
}

export async function handleCultivationModal(
  interaction: ModalSubmitInteraction, service: BreakthroughService, roleSync: DiscordRoleSync,
) {
  const [, action, id, rawIndex] = interaction.customId.split(':');
  const index = Number(rawIndex);
  if (action !== 'submit' || !interaction.guildId || !id || !interaction.message || !Number.isSafeInteger(index)) throw new CultivationError('Form Thiên Kiếp không hợp lệ.');
  const value = await service.getOwned(id, interaction.guildId, interaction.user.id, interaction.message.id);
  await interaction.deferUpdate();
  if (value.currentIndex !== index) {
    await refreshBreakthroughMessage(interaction, value, index, service, roleSync);
    return;
  }
  try {
    const updated = await service.answer(value, interaction.fields.getTextInputValue('answer'));
    await interaction.editReply(buildBreakthroughAnswered(updated));
  } catch (error) {
    if (!(error instanceof CultivationError)) throw error;
    const latest = await service.getOwned(id, interaction.guildId, interaction.user.id);
    await refreshBreakthroughMessage(interaction, latest, index, service, roleSync);
  }
}

async function refreshBreakthroughMessage(
  interaction: ModalSubmitInteraction,
  attempt: Awaited<ReturnType<BreakthroughService['getOwned']>>,
  submittedIndex: number,
  service: BreakthroughService,
  roleSync: DiscordRoleSync,
): Promise<void> {
  if (attempt.status === 'active') {
    if (attempt.currentIndex === submittedIndex && typeof attempt.questions[submittedIndex]?.answer === 'string') {
      await interaction.editReply(buildBreakthroughAnswered(attempt));
      await interaction.followUp({
        content: 'Câu trả lời đã được ghi nhận trước đó; không chấm lặp lần nữa.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const audio = await service.replay(attempt);
    await interaction.editReply(buildBreakthroughQuestion(attempt, audio));
    await interaction.followUp({
      content: `Phiên đã chuyển sang câu ${attempt.currentIndex + 1}/10; giao diện đã được đồng bộ.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const result = buildBreakthroughResult(attempt, REALMS[attempt.toMajor]!);
  if (attempt.status === 'passed' && interaction.guild) {
    const sync = await roleSync.sync(interaction.guild, interaction.user.id, attempt.toMajor);
    result.content = `${sync.synced ? '✅' : '⚠️'} ${sync.message}`;
  }
  await interaction.editReply(result);
  await interaction.followUp({
    content: 'Thiên Kiếp này đã kết thúc; kết quả hiện tại đã được hiển thị.',
    flags: MessageFlags.Ephemeral,
  });
}
