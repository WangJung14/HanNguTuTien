import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, escapeMarkdown,
} from 'discord.js';
import type { DictionaryEntry } from '../../dictionary/domain/dictionary.types.js';
import type { BagService } from '../application/bag.service.js';
import { pinyinToToneMarks } from '../../dictionary/domain/pinyin.js';

// customId có chứa ownerId: nút chỉ có hiệu lực với người tra từ ban đầu.
export function createSaveButtons(entries: DictionaryEntry[], ownerId: string) {
  if (!entries.length) return [];
  const row = new ActionRowBuilder<ButtonBuilder>();
  for (const entry of entries.slice(0, 5)) {
    row.addComponents(new ButtonBuilder()
      .setCustomId(`bag:add:${ownerId}:${entry.id}`)
      .setLabel(`Lưu ${entry.simplified}`.slice(0, 80))
      .setEmoji('📥')
      .setStyle(ButtonStyle.Secondary));
  }
  return [row];
}

export async function buildBagMessage(service: BagService, guildId: string, userId: string, page: number) {
  const bag = await service.list(guildId, userId, page);
  const embed = new EmbedBuilder()
    .setColor(0x6c5ce7)
    .setTitle('🎒 Túi Càn Khôn — Kho từ vựng')
    .setDescription(bag.total
      ? `Đã thu thập **${bag.total}** mục từ · Trang ${bag.page}/${bag.totalPages}`
      : 'Túi của đạo hữu còn trống. Dùng `/tudien` rồi bấm **Lưu** để thu thập từ mới!')
    .setFooter({ text: 'Mỗi đạo hữu có túi từ riêng · Không cộng XP khi lưu từ' });
  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let start = 0; start < bag.items.length; start += 5) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (const { entry } of bag.items.slice(start, start + 5)) {
      const reading = pinyinToToneMarks(entry.pinyinRaw);
      const meaning = entry.meanings.find((m) => !m.startsWith('LT:')) ?? entry.meanings[0] ?? '(chưa có nghĩa)';
      embed.addFields({
        name: `#${entry.id} · ${escapeMarkdown(entry.simplified)} — ${escapeMarkdown(reading)}`.slice(0, 256),
        value: escapeMarkdown(meaning.slice(0, 110)),
        inline: false,
      });
      row.addComponents(new ButtonBuilder()
        .setCustomId(`bag:remove:${userId}:${entry.id}:${bag.page}`)
        .setLabel(`Bỏ ${entry.simplified}`.slice(0, 80))
        .setStyle(ButtonStyle.Danger));
    }
    components.push(row);
  }
  // Trang tiếp / trước: slash command /tuikho trang:<number> (tránh quá 5 action rows).
  if (bag.totalPages > 1) {
    embed.addFields({ name: '📖 Xem trang khác', value: `Gõ \`/tuikho trang:${bag.page === bag.totalPages ? 1 : bag.page + 1}\`` });
  }
  return { embeds: [embed], components };
}
