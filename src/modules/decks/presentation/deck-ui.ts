import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, escapeMarkdown,
} from 'discord.js';
import type { DictionaryEntry } from '../../dictionary/domain/dictionary.types.js';
import { pinyinToToneMarks } from '../../dictionary/domain/pinyin.js';
import type { Deck } from '../domain/deck.types.js';
import type { DeckView } from '../application/deck.service.js';

export function createDeckButtons(entries: DictionaryEntry[], ownerId: string) {
  if (!entries.length) return [];
  const row = new ActionRowBuilder<ButtonBuilder>();
  for (const entry of entries.slice(0, 5)) {
    row.addComponents(new ButtonBuilder()
      .setCustomId(`deck:pick:${ownerId}:${entry.id}`)
      .setLabel(`Thêm ${entry.simplified} vào bộ`.slice(0, 80))
      .setEmoji('📚')
      .setStyle(ButtonStyle.Primary));
  }
  return [row];
}

export function buildDeckList(decks: Deck[], title: string, emptyMessage: string) {
  const embed = new EmbedBuilder().setColor(0x6c5ce7).setTitle(title)
    .setDescription(decks.length ? `Tìm được **${decks.length}** bộ từ:` : emptyMessage)
    .setFooter({ text: 'Mã bộ từ (#ID) dùng với lệnh /botu. Không cộng XP khi lưu từ.' });
  for (const deck of decks) {
    embed.addFields({
      name: `#${deck.id} · ${escapeMarkdown(deck.name).slice(0, 180)}`,
      value: `${deck.isPublic ? '🌍 Công khai' : '🔒 Riêng tư'} · ${deck.wordCount} từ · Chủ bộ: <@${deck.ownerId}>`,
    });
  }
  return { embeds: [embed] };
}

export function buildDeckView(view: DeckView) {
  const { deck } = view;
  const embed = new EmbedBuilder()
    .setColor(0x20c997)
    .setTitle(`📜 #${deck.id} — ${escapeMarkdown(deck.name).slice(0, 200)}`)
    .setDescription([
      deck.description ? escapeMarkdown(deck.description) : 'Bộ từ vựng Hán ngữ',
      `${deck.isPublic ? '🌍 Công khai' : '🔒 Riêng tư'} · ${deck.wordCount} từ · Trang ${view.page}/${view.totalPages}`,
    ].join('\n'))
    .setFooter({ text: 'Dùng /botu them, /botu bo, /botu saochep hoặc /botu chuyen để quản lý.' });
  for (const { entry } of view.items) {
    const meaning = entry.meanings.find((m) => !m.startsWith('LT:')) ?? entry.meanings[0] ?? 'Chưa có nghĩa';
    embed.addFields({
      name: `#${entry.id} · ${escapeMarkdown(entry.simplified).slice(0, 80)} — ${escapeMarkdown(pinyinToToneMarks(entry.pinyinRaw)).slice(0, 80)}`,
      value: escapeMarkdown(meaning.slice(0, 160)),
    });
  }
  if (deck.wordCount === 0) embed.addFields({ name: 'Còn trống', value: 'Dùng /tudien rồi nhấn **Thêm vào bộ** để bắt đầu.' });
  if (view.totalPages > 1) embed.addFields({ name: 'Trang khác', value: `Dùng \`/botu xem id:${deck.id} trang:${view.page === view.totalPages ? 1 : view.page + 1}\`` });
  return { embeds: [embed] };
}
