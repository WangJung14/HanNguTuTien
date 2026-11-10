import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder,
} from 'discord.js';
import type { DeckService } from '../application/deck.service.js';
import { buildDeckList, buildDeckView } from './deck-ui.js';

export const botuDefinition = new SlashCommandBuilder()
  .setName('botu').setDescription('📚 Quản lý Bộ Từ Vựng trong Túi Càn Khôn')
  .addSubcommand((sub) => sub.setName('tao').setDescription('Tạo một bộ từ mới (mặc định riêng tư)')
    .addStringOption((opt) => opt.setName('ten').setDescription('Tên bộ, ví dụ Gia đình').setRequired(true).setMaxLength(40))
    .addStringOption((opt) => opt.setName('mota').setDescription('Mô tả ngắn').setMaxLength(160)))
  .addSubcommand((sub) => sub.setName('danhsach').setDescription('Xem các bộ từ của chính bạn'))
  .addSubcommand((sub) => sub.setName('khampha').setDescription('Xem những bộ từ công khai trong server'))
  .addSubcommand((sub) => sub.setName('xem').setDescription('Xem các từ trong một bộ')
    .addIntegerOption((opt) => opt.setName('id').setDescription('Mã bộ từ, ví dụ 1').setRequired(true).setMinValue(1))
    .addIntegerOption((opt) => opt.setName('trang').setDescription('Trang muốn xem').setMinValue(1)))
  .addSubcommand((sub) => sub.setName('them').setDescription('Thêm một mục từ vào bộ của bạn')
    .addIntegerOption((opt) => opt.setName('id').setDescription('Mã bộ từ').setRequired(true).setMinValue(1))
    .addIntegerOption((opt) => opt.setName('matu').setDescription('ID mục từ hiển thị trong /tudien').setRequired(true).setMinValue(1)))
  .addSubcommand((sub) => sub.setName('bo').setDescription('Bỏ từ khỏi bộ (vẫn giữ trong Túi Càn Khôn)')
    .addIntegerOption((opt) => opt.setName('id').setDescription('Mã bộ từ').setRequired(true).setMinValue(1))
    .addIntegerOption((opt) => opt.setName('matu').setDescription('ID mục từ').setRequired(true).setMinValue(1)))
  .addSubcommand((sub) => sub.setName('chuyen').setDescription('Chuyển từ giữa hai bộ của bạn')
    .addIntegerOption((opt) => opt.setName('tu').setDescription('ID bộ nguồn').setRequired(true).setMinValue(1))
    .addIntegerOption((opt) => opt.setName('den').setDescription('ID bộ đích').setRequired(true).setMinValue(1))
    .addIntegerOption((opt) => opt.setName('matu').setDescription('ID mục từ').setRequired(true).setMinValue(1)))
  .addSubcommand((sub) => sub.setName('congkhai').setDescription('Bật/tắt chia sẻ bộ trong server')
    .addIntegerOption((opt) => opt.setName('id').setDescription('Mã bộ từ').setRequired(true).setMinValue(1))
    .addBooleanOption((opt) => opt.setName('bat').setDescription('true = công khai, false = riêng tư').setRequired(true)))
  .addSubcommand((sub) => sub.setName('saochep').setDescription('Sao chép bộ từ công khai vào tài khoản của bạn')
    .addIntegerOption((opt) => opt.setName('id').setDescription('Mã bộ muốn sao chép').setRequired(true).setMinValue(1))
    .addStringOption((opt) => opt.setName('ten').setDescription('Tên mới, mặc định tên gốc + (bản sao)').setMaxLength(40)))
  .addSubcommand((sub) => sub.setName('xoa').setDescription('Xóa bộ từ của bạn (có bước xác nhận)')
    .addIntegerOption((opt) => opt.setName('id').setDescription('Mã bộ từ cần xóa').setRequired(true).setMinValue(1)));

export async function handleBotu(interaction: ChatInputCommandInteraction, service: DeckService) {
  if (!interaction.guildId) {
    await interaction.reply({ content: 'Dùng lệnh này trong Discord server nhé đạo hữu.', flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const opt = interaction.options;
  const sub = opt.getSubcommand();
  const id = () => opt.getInteger('id', true);
  const word = () => opt.getInteger('matu', true);

  switch (sub) {
    case 'tao': {
      const deck = service.create(guildId, userId, opt.getString('ten', true), opt.getString('mota') ?? '');
      await interaction.editReply(`✅ Đã tạo bộ **${deck.name}** (#${deck.id}), mặc định 🔒 riêng tư. Tra từ bằng \`/tudien\` rồi nhấn **Thêm vào bộ**.`);
      return;
    }
    case 'danhsach':
      await interaction.editReply(buildDeckList(service.listOwned(guildId, userId), '🎒 Bộ Từ Vựng của bạn', 'Chưa có bộ nào. Dùng `/botu tao` để tạo bộ đầu tiên.'));
      return;
    case 'khampha':
      await interaction.editReply(buildDeckList(service.listPublic(guildId), '🌍 Tàng Kinh Các — Bộ từ công khai', 'Chưa có bộ công khai nào trong server.'));
      return;
    case 'xem':
      await interaction.editReply(buildDeckView(service.view(guildId, userId, id(), opt.getInteger('trang') ?? 1)));
      return;
    case 'them': {
      const added = service.add(guildId, userId, id(), word());
      await interaction.editReply(added ? '✅ Đã thêm mục từ vào bộ và Túi Càn Khôn.' : '📦 Từ này đã có trong bộ rồi.');
      return;
    }
    case 'bo': {
      const removed = service.remove(guildId, userId, id(), word());
      await interaction.editReply(removed ? '🧹 Đã bỏ từ khỏi bộ. Từ vẫn nằm trong Túi Càn Khôn.' : 'Không tìm thấy từ này trong bộ.');
      return;
    }
    case 'chuyen': {
      const moved = service.move(guildId, userId, opt.getInteger('tu', true), opt.getInteger('den', true), word());
      await interaction.editReply(moved ? '📦 Đã chuyển từ sang bộ đích.' : 'Không thấy từ đó trong bộ nguồn.');
      return;
    }
    case 'congkhai': {
      const deck = service.visibility(guildId, userId, id(), opt.getBoolean('bat', true));
      await interaction.editReply(deck.isPublic
        ? `🌍 Bộ **${deck.name}** (#${deck.id}) đã công khai trong server. Người khác có thể dùng \`/botu saochep id:${deck.id}\`.`
        : `🔒 Bộ **${deck.name}** đã chuyển về riêng tư.`);
      return;
    }
    case 'saochep': {
      const copied = service.copy(guildId, userId, id(), opt.getString('ten') ?? undefined);
      await interaction.editReply(`📚 Đã sao chép thành bộ **${copied.name}** (#${copied.id}), có **${copied.wordCount}** từ. Bản sao mặc định riêng tư.`);
      return;
    }
    case 'xoa': {
      const deck = service.getVisible(guildId, userId, id());
      if (deck.ownerId !== userId) {
        await interaction.editReply('⛔ Bạn chỉ được xóa bộ do mình tạo.');
        return;
      }
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`deck:delete:${userId}:${deck.id}`)
          .setLabel('Xác nhận xóa bộ').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`deck:cancel:${userId}:${deck.id}`)
          .setLabel('Hủy').setStyle(ButtonStyle.Secondary),
      );
      await interaction.editReply({
        content: `⚠️ Xóa bộ **${deck.name}** (#${deck.id}) và ${deck.wordCount} liên kết từ? Các từ vẫn giữ trong Túi Càn Khôn.`,
        components: [row],
      });
      return;
    }
  }
}
