import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, escapeMarkdown } from 'discord.js';
import type { SynthesizedAudio } from '../../dictation/index.js';
import type { BreakthroughAttempt, RealmProgress, XpLedgerEntry } from '../domain/cultivation.types.js';
import type { MajorRealm } from '../domain/cultivation.config.js';

export function buildProfileEmbed(progress: RealmProgress) {
  const xp = progress.profile.totalXp;
  const target = progress.nextTargetXp;
  const base = progress.minor.minXp;
  const ratio = target ? Math.max(0, Math.min(1, (xp - base) / Math.max(1, target - base))) : 1;
  const filled = Math.round(ratio * 10);
  const bar = `${'▰'.repeat(filled)}${'▱'.repeat(10 - filled)}`;
  const next = progress.isMax ? 'Đã đạt đỉnh tiên lộ'
    : progress.needsBreakthrough ? `Đủ điều kiện dùng **/dotpha** lên ${progress.nextMajor!.name}`
      : `Cần thêm **${Math.max(0, target! - xp)} XP**`;
  return new EmbedBuilder().setColor(progress.major.color).setTitle('🌀 Tu Vi').setDescription([
    `Cảnh giới: **${progress.label}**`, `Tổng tu vi: **${xp.toLocaleString('vi-VN')} XP**`,
    `${bar} ${target ? `${xp}/${target}` : xp}`, next,
    progress.profile.roleSyncPending ? '⚠️ Role cảnh giới đang chờ đồng bộ lại.' : '',
  ].filter(Boolean).join('\n'));
}

export function buildBreakthroughQuestion(attempt: BreakthroughAttempt, audio?: SynthesizedAudio) {
  const question = attempt.questions[attempt.currentIndex]!;
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`cultivation:replay:${attempt.id}:${attempt.currentIndex}`).setLabel('Nghe lại').setEmoji('⚡').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`cultivation:answer:${attempt.id}:${attempt.currentIndex}`).setLabel('Trả lời').setEmoji('✍️').setStyle(ButtonStyle.Danger),
  );
  return { content: `⚡ **Thiên Kiếp ${attempt.currentIndex + 1}/10** · Cần đạt ít nhất 8/10\nNghe âm thanh và nhập chữ Hán.`,
    embeds: [], components: [row], attachments: [], files: audio ? [new AttachmentBuilder(audio.data, { name: `thien-kiep.${audio.format}` })] : [] };
}

export function buildBreakthroughWorksheet(attempt: BreakthroughAttempt, audios?: SynthesizedAudio[]) {
  const batchStart = attempt.currentIndex < 5 ? 0 : 5;
  const batchEnd = Math.min(batchStart + 5, attempt.questions.length);
  const rows = attempt.questions.map((_, index) => {
    const state = index < attempt.currentIndex ? '✅ Đã ghi nhận' : index < batchStart ? '⏳ Chờ' : '✍️ Chưa trả lời';
    return `**${index + 1}.** Nghe tệp \`thien-kiep-${String(index + 1).padStart(2, '0')}\` — ${state}`;
  });
  const button = new ButtonBuilder()
    .setCustomId(`cultivation:sheet:${attempt.id}:${batchStart}`)
    .setLabel(`Trả lời câu ${batchStart + 1}–${batchEnd}`)
    .setEmoji('📝')
    .setStyle(ButtonStyle.Primary);
  const payload: {
    content: string; embeds: never[]; components: ActionRowBuilder<ButtonBuilder>[];
    files?: AttachmentBuilder[];
  } = {
    content: [
      '⚡ **PHIẾU THIÊN KIẾP — 10 CÂU** · Cần đạt ít nhất 8/10',
      'Nghe đủ 10 tệp âm thanh. Discord giới hạn 5 ô mỗi phiếu nhập, nên hãy nộp lần lượt câu 1–5 rồi 6–10.',
      '', ...rows,
    ].join('\n'),
    embeds: [],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(button)],
  };
  if (audios) {
    payload.files = audios.map((audio, index) => new AttachmentBuilder(audio.data, {
      name: `thien-kiep-${String(index + 1).padStart(2, '0')}.${audio.format}`,
    }));
  }
  return payload;
}

export function buildBreakthroughAnswered(attempt: BreakthroughAttempt) {
  const question = attempt.questions[attempt.currentIndex]!;
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`cultivation:next:${attempt.id}:${attempt.currentIndex}`)
      .setLabel(attempt.currentIndex === 9 ? 'Nhận kết quả' : 'Câu tiếp theo').setStyle(ButtonStyle.Primary),
  );
  return { content: `${question.correct ? '✅ Vượt qua' : '❌ Lôi kiếp đánh trúng'} · Câu ${attempt.currentIndex + 1}/10\nĐáp án: **${escapeMarkdown(question.simplified)}** · ${escapeMarkdown(question.pinyin)}\nHiện đúng: **${attempt.correctCount}/${attempt.currentIndex + 1}**`,
    embeds: [], components: [row], attachments: [], files: [] };
}

export function buildBreakthroughResult(attempt: BreakthroughAttempt, realm: MajorRealm) {
  const passed = attempt.status === 'passed';
  const review = attempt.questions.map((question, index) =>
    `${question.correct ? '✅' : '❌'} **${index + 1}. ${escapeMarkdown(question.simplified)}** · ${escapeMarkdown(question.pinyin)}${question.correct ? '' : ` · Bạn viết: ${escapeMarkdown(question.answer || '(trống)')}`}`,
  ).join('\n');
  return { content: '', components: [], attachments: [], files: [], embeds: [new EmbedBuilder()
    .setColor(passed ? realm.color : 0x7f8c8d)
    .setTitle(passed ? '🌩️ Đột phá thành công!' : '☁️ Đột phá thất bại')
    .setDescription(passed
      ? `Đạt **${attempt.correctCount}/10**. Thiên môn khai mở, đạo hữu tiến vào **${realm.name}**!`
      : `Đạt **${attempt.correctCount}/10**, cần ít nhất 8 câu đúng. Không mất XP; có thể thử lại sau cooldown.`)
    .addFields({ name: 'Đối chiếu phiếu', value: review.slice(0, 1024) })] };
}

export function buildHistoryEmbed(ledger: XpLedgerEntry[], attempts: BreakthroughAttempt[]) {
  const sourceName: Record<string, string> = { dictation_correct: 'Chính tả đúng', dictation_complete: 'Hoàn thành khảo bài', dictation_perfect_10: 'Hoàn mỹ 10/10' };
  const xpLines = ledger.length ? ledger.map((x) => `• +${x.amount} XP · ${sourceName[x.source] ?? x.source} · <t:${Math.floor(Date.parse(x.createdAt) / 1000)}:R>`).join('\n') : 'Chưa có lịch sử XP.';
  const attemptLines = attempts.length ? attempts.map((x) => `• ${x.status === 'passed' ? '✅' : x.status === 'failed' ? '❌' : '⚡'} ${x.correctCount}/10 · <t:${Math.floor(Date.parse(x.createdAt) / 1000)}:R>`).join('\n') : 'Chưa từng khiêu chiến Thiên Kiếp.';
  return new EmbedBuilder().setColor(0x6c5ce7).setTitle('📜 Lịch sử tu vi')
    .addFields({ name: 'Tu vi gần đây', value: xpLines.slice(0, 1024) }, { name: 'Thiên Kiếp gần đây', value: attemptLines.slice(0, 1024) });
}
