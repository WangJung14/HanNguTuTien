import {
  ActionRowBuilder,
  ButtonBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  escapeMarkdown,
  SlashCommandBuilder,
} from 'discord.js';
import type { DictionaryService } from '../application/dictionary.service.js';
import type { DictionaryEntry, SearchMode } from '../domain/dictionary.types.js';
import { pinyinToToneMarks } from '../domain/pinyin.js';

export const tudienDefinition = new SlashCommandBuilder()
  .setName('tudien')
  .setDescription('Tra từ điển Trung–Việt từ CVDICT')
  .addStringOption((option) => option
    .setName('tu').setDescription('Ví dụ: 学习, 學習, xuexi, học tập').setRequired(true)
    .setMaxLength(64))
  .addStringOption((option) => option
    .setName('kieu').setDescription('Chọn loại tìm kiếm nếu cần')
    .addChoices(
      { name: 'Tự động', value: 'auto' },
      { name: 'Chữ Hán', value: 'hanzi' },
      { name: 'Pinyin', value: 'pinyin' },
      { name: 'Nghĩa tiếng Việt', value: 'vi' },
    ));

export async function handleTudien(
  interaction: ChatInputCommandInteraction,
  service: DictionaryService,
  createExtraButtons?: (entries: DictionaryEntry[], ownerId: string) => ActionRowBuilder<ButtonBuilder>[],
) {
  await interaction.deferReply();
  const query = interaction.options.getString('tu', true);
  const mode = (interaction.options.getString('kieu') || 'auto') as SearchMode;
  const result = service.search(query, mode);
  if (!result.entries.length) {
    await interaction.editReply(`Không tìm thấy **${escapeMarkdown(query)}**. Hãy thử kiểu tìm kiếm khác.`);
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0x6c5ce7)
    .setTitle(`📚 Hán Ngữ Từ Điển — ${query.slice(0, 50)}`)
    .setDescription(`Kết quả: ${result.entries.length} mục từ · tìm theo ${result.mode}`)
    .setFooter({ text: 'CVDICT · Nghĩa Việt tham khảo, cần kiểm chứng khi học/thi' });

  for (const entry of result.entries) {
    const hanzi = entry.traditional !== entry.simplified
      ? `${entry.simplified} (繁: ${entry.traditional})` : entry.simplified;
    const pinyin = pinyinToToneMarks(entry.pinyinRaw);
    const primary = entry.meanings.filter((m) => !/^LT:/u.test(m));
    const meanings = primary.length ? primary : entry.meanings;
    const lines = meanings.slice(0, 5).map((m, i) => `${i + 1}. ${escapeMarkdown(m.slice(0, 150))}`);
    if (meanings.length > 5) lines.push(`… và ${meanings.length - 5} nghĩa khác`);
    embed.addFields({
      name: `#${entry.id} · ${hanzi.slice(0, 70)} — ${pinyin.slice(0, 65)}`,
      value: lines.join('\n').slice(0, 850) || '(Chưa có nghĩa)',
    });
  }
  const components = createExtraButtons?.(result.entries, interaction.user.id) ?? [];
  await interaction.editReply({ embeds: [embed], components });
}
