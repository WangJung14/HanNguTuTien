import {
  ActionRowBuilder, ButtonInteraction, MessageFlags, StringSelectMenuBuilder,
  StringSelectMenuInteraction,
} from 'discord.js';
import type { DeckService } from '../application/deck.service.js';

export async function handleDeckButton(interaction: ButtonInteraction, service: DeckService): Promise<void> {
  const [, action, ownerId, rawId] = interaction.customId.split(':');
  if (!interaction.guildId || ownerId !== interaction.user.id) {
    await interaction.reply({ content: '⛔ Nút này không phải của đạo hữu.', flags: MessageFlags.Ephemeral });
    return;
  }
  const entryOrDeckId = Number(rawId);
  if (!Number.isSafeInteger(entryOrDeckId) || entryOrDeckId <= 0) {
    await interaction.reply({ content: 'Nút đã hết hiệu lực hoặc không hợp lệ.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (action === 'pick') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const decks = await service.listOwned(interaction.guildId, interaction.user.id);
    if (!decks.length) {
      await interaction.editReply('🎒 Chưa có bộ từ. Hãy dùng `/botu tao` để tạo bộ, sau đó tra từ lại nhé.');
      return;
    }
    const select = new StringSelectMenuBuilder()
      .setCustomId(`deck:select:${interaction.user.id}:${entryOrDeckId}`)
      .setPlaceholder('Chọn bộ để thêm từ vào')
      .addOptions(decks.map((d) => ({
        label: d.name.slice(0, 100),
        description: `#${d.id} · ${d.wordCount} từ`,
        value: String(d.id),
      })));
    await interaction.editReply({ content: '📚 Chọn bộ từ của bạn:', components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)] });
    return;
  }
  if (action === 'delete') {
    await interaction.deferUpdate();
    const deleted = await service.delete(interaction.guildId, interaction.user.id, entryOrDeckId);
    await interaction.editReply({ content: deleted ? '🗑️ Đã xóa bộ từ. Các từ trong Túi Càn Khôn vẫn còn.' : 'Bộ từ không còn tồn tại.', components: [] });
    return;
  }
  if (action === 'cancel') {
    await interaction.update({ content: 'Đã hủy xóa bộ từ.', components: [] });
    return;
  }
  await interaction.reply({ content: 'Nút không được hỗ trợ.', flags: MessageFlags.Ephemeral });
}

export async function handleDeckSelect(interaction: StringSelectMenuInteraction, service: DeckService): Promise<void> {
  const [, action, ownerId, rawEntryId] = interaction.customId.split(':');
  if (!interaction.guildId || action !== 'select' || ownerId !== interaction.user.id) {
    await interaction.reply({ content: '⛔ Không thể thao tác trên bộ từ của người khác.', flags: MessageFlags.Ephemeral });
    return;
  }
  const entryId = Number(rawEntryId);
  const deckId = Number(interaction.values[0]);
  if (!Number.isSafeInteger(entryId) || entryId <= 0 || !Number.isSafeInteger(deckId) || deckId <= 0) {
    await interaction.reply({ content: 'Lựa chọn không hợp lệ.', flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferUpdate();
  const added = await service.add(interaction.guildId, interaction.user.id, deckId, entryId);
  await interaction.editReply({
    content: added ? `✅ Đã thêm từ #${entryId} vào bộ #${deckId} và Túi Càn Khôn!` : '📦 Từ này đã có trong bộ rồi.',
    components: [],
  });
}
