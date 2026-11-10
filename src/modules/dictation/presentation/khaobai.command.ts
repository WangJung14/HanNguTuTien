import {
  ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder,
} from 'discord.js';
import type { DictationService } from '../application/dictation.service.js';
import { buildAnsweredMessage, buildDeckSelect, buildQuestionMessage, buildWorksheetMessage } from './dictation-ui.js';

export const khaobaiDefinition = new SlashCommandBuilder()
  .setName('khaobai')
  .setDescription('🎧 Nghe và viết lại từ tiếng Trung từ bộ từ cá nhân')
  .addSubcommand((sub) => sub.setName('batdau').setDescription('Bắt đầu phiên khảo bài mới'))
  .addSubcommand((sub) => sub.setName('vietgiay').setDescription('Bot đọc từng từ để bạn viết ra giấy, không cần gửi đáp án'))
  .addSubcommand((sub) => sub.setName('tieptuc').setDescription('Mở lại phiên đang hoạt động sau khi thoát hoặc bot khởi động lại'));

export async function handleKhaobai(
  interaction: ChatInputCommandInteraction,
  service: DictationService,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ content: 'Dùng lệnh này trong Discord server nhé đạo hữu.', flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (interaction.options.getSubcommand() === 'tieptuc') {
    const resumed = await service.resume(interaction.guildId, interaction.user.id);
    const response = resumed.session.mode === 'discord' && resumed.worksheet
      ? await interaction.editReply(buildWorksheetMessage(resumed.session, resumed.worksheet, true))
      : resumed.question.answeredAt
        ? await interaction.editReply(buildAnsweredMessage(resumed.session, resumed.question))
        : await interaction.editReply(buildQuestionMessage(resumed.session, resumed.question, resumed.audio ?? undefined));
    await service.bindMessage(resumed.session.id, response.id);
    return;
  }

  const active = await service.getActiveSession(interaction.guildId, interaction.user.id);
  if (active) {
    await interaction.editReply('Bạn đang có một phiên khảo bài. Dùng `/khaobai tieptuc` để mở lại hoặc hoàn thành phiên đó trước.');
    return;
  }
  const decks = await service.listOwnedDecks(interaction.guildId, interaction.user.id);
  if (!decks.length) {
    await interaction.editReply('Bạn chưa có bộ từ cá nhân. Dùng `/botu tao`, thêm ít nhất 5 từ bằng `/tudien`, rồi quay lại đây.');
    return;
  }
  const mode = interaction.options.getSubcommand() === 'vietgiay' ? 'paper' : 'discord';
  await interaction.editReply(buildDeckSelect(interaction.user.id, decks, mode));
}
