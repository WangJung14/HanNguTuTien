import {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle,
  EmbedBuilder, escapeMarkdown, StringSelectMenuBuilder,
} from 'discord.js';
import type { DictationQuestion, DictationSession } from '../domain/dictation.types.js';
import type { SynthesizedAudio } from '../domain/dictation.types.js';
import type { DictationWorksheet } from '../application/dictation.service.js';

export function buildDeckSelect(
  userId: string,
  decks: { id: number; name: string; wordCount: number }[],
  mode: DictationSession['mode'] = 'discord',
) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`dictation:deck:${userId}:${mode}`)
    .setPlaceholder('Chọn bộ từ cá nhân')
    .addOptions(decks.slice(0, 25).map((deck) => ({
      label: deck.name.slice(0, 100),
      description: `#${deck.id} · ${deck.wordCount} từ`,
      value: String(deck.id),
    })));
  return {
    content: '📚 Chọn một bộ từ do bạn sở hữu. Bộ cần có ít nhất 5 từ đủ điều kiện.',
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
  };
}

export function buildCountSelect(
  userId: string,
  deckId: number,
  eligibleCount: number,
  mode: DictationSession['mode'] = 'discord',
) {
  const counts = [5, 10, 20].filter((count) => count <= eligibleCount);
  const select = new StringSelectMenuBuilder()
    .setCustomId(`dictation:count:${userId}:${deckId}:${mode}`)
    .setPlaceholder('Chọn số câu')
    .addOptions(counts.map((count) => ({
      label: `${count} câu`,
      description: `Chọn ngẫu nhiên ${count} từ, không lặp trong phiên`,
      value: String(count),
    })));
  return {
    content: `✅ Bộ có **${eligibleCount}** từ đủ điều kiện. Chọn số câu muốn khảo:`,
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
  };
}

export function buildQuestionMessage(
  session: DictationSession,
  question: DictationQuestion,
  audio?: SynthesizedAudio,
) {
  if (session.mode === 'paper') return buildPaperQuestionMessage(session, question, audio);
  const lines = [
    `🎧 **Câu ${question.questionIndex + 1}/${session.questionCount}** · Bộ **${escapeMarkdown(session.deckName).slice(0, 100)}**`,
    'Nghe audio rồi nhập chữ Hán. Chữ Hán và Pinyin được ẩn cho đến khi chấm.',
  ];
  if (question.usedHint) {
    lines.push(`💡 Gợi ý: ${[...question.simplified].length} chữ · nghĩa: ${escapeMarkdown(question.meaningVi || 'Chưa có nghĩa trong từ điển.').slice(0, 500)}`);
  }
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(controlId('replay', session, question))
      .setLabel('Nghe lại').setEmoji('🔁').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(controlId('slow', session, question))
      .setLabel('Đọc chậm').setEmoji('🐢').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(controlId('hint', session, question))
      .setLabel('Gợi ý').setEmoji('💡').setStyle(ButtonStyle.Secondary)
      .setDisabled(question.usedHint),
    new ButtonBuilder().setCustomId(controlId('answer', session, question))
      .setLabel('Trả lời').setEmoji('✍️').setStyle(ButtonStyle.Primary),
  );
  return {
    content: lines.join('\n'),
    embeds: [],
    components: [row],
    attachments: [],
    files: audio ? [new AttachmentBuilder(audio.data, { name: `khaobai.${audio.format}` })] : [],
  };
}

export function buildWorksheetMessage(
  session: DictationSession,
  worksheet: DictationWorksheet,
  includeAudio = false,
) {
  const halfStart = session.currentIndex < worksheet.batchStart + 5
    ? worksheet.batchStart : worksheet.batchStart + 5;
  const halfEnd = Math.min(halfStart + 5, worksheet.batchEnd);
  const lines = worksheet.questions.map((question) => {
    const state = question.questionIndex < session.currentIndex ? '✅ Đã ghi nhận' : '✍️ Chưa trả lời';
    return `**${question.questionIndex + 1}.** Nghe tệp \`khaobai-${String(question.questionIndex + 1).padStart(2, '0')}\` — ${state}`;
  });
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`dictation:sheet:${session.id}:${halfStart}`)
      .setLabel(`Trả lời câu ${halfStart + 1}–${halfEnd}`)
      .setEmoji('📝').setStyle(ButtonStyle.Primary),
  );
  const payload: {
    content: string; embeds: never[]; components: ActionRowBuilder<ButtonBuilder>[];
    attachments?: never[]; files?: AttachmentBuilder[];
  } = {
    content: [
      `🎧 **PHIẾU KHẢO BÀI ${worksheet.batchStart + 1}–${worksheet.batchEnd}/${session.questionCount}** · Bộ **${escapeMarkdown(session.deckName).slice(0, 100)}**`,
      'Nghe các tệp trong nhóm. Discord cho tối đa 5 ô nhập, vì vậy hãy nộp lần lượt từng nửa phiếu.',
      'Đúng/sai chỉ được công bố sau khi hoàn thành toàn bộ phiên.',
      '', ...lines,
    ].join('\n'),
    embeds: [], components: [row],
  };
  if (includeAudio) {
    payload.attachments = [];
    payload.files = worksheet.audios.map((audio, index) => {
      const questionIndex = worksheet.batchStart + index;
      return new AttachmentBuilder(audio.data, {
        name: `khaobai-${String(questionIndex + 1).padStart(2, '0')}.${audio.format}`,
      });
    });
  }
  return payload;
}

export function buildPaperQuestionMessage(
  session: DictationSession,
  question: DictationQuestion,
  audio?: SynthesizedAudio,
) {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(controlId('replay', session, question))
      .setLabel('Nghe lại').setEmoji('🔁').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(controlId('reveal', session, question))
      .setLabel('Đáp án đã đọc').setEmoji('📜').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(controlId('next', session, question))
      .setLabel(question.questionIndex + 1 === session.questionCount ? 'Hoàn thành' : 'Từ tiếp theo')
      .setEmoji(question.questionIndex + 1 === session.questionCount ? '🏁' : '➡️')
      .setStyle(ButtonStyle.Primary),
  );
  return {
    content: [
      `🎧 **Từ ${question.questionIndex + 1}/${session.questionCount}** · Bộ **${escapeMarkdown(session.deckName).slice(0, 100)}**`,
      'Nghe và viết ra giấy. Khi sẵn sàng, bấm **Từ tiếp theo**; không cần gửi đáp án trên Discord.',
    ].join('\n'),
    embeds: [],
    components: [row],
    attachments: [],
    files: audio ? [new AttachmentBuilder(audio.data, { name: `khaobai.${audio.format}` })] : [],
  };
}

export function buildReadAnswers(questions: DictationQuestion[]): string {
  const lines = questions.map((question) => {
    const traditional = question.traditional !== question.simplified
      ? ` (${escapeMarkdown(question.traditional).slice(0, 30)})` : '';
    return `**${question.questionIndex + 1}.** ${escapeMarkdown(question.simplified).slice(0, 30)}${traditional} · ${escapeMarkdown(question.pinyin).slice(0, 50)}`;
  });
  return `📜 **Đáp án đã đọc (${questions.length} từ)**\n${lines.join('\n')}`;
}

export function buildPaperSummary(session: DictationSession, questions: DictationQuestion[]) {
  const embed = new EmbedBuilder()
    .setColor(0x20c997)
    .setTitle('🏁 Đã đọc xong bài viết giấy')
    .setDescription(`Bộ **${escapeMarkdown(session.deckName).slice(0, 100)}** · **${questions.length} từ**`);
  for (let index = 0; index < questions.length; index += 8) {
    const batch = questions.slice(index, index + 8);
    embed.addFields({
      name: `📖 Đáp án ${index + 1}–${index + batch.length}`,
      value: batch.map((question) =>
        `**${question.questionIndex + 1}.** ${escapeMarkdown(question.simplified)} · ${escapeMarkdown(question.pinyin)} — ${escapeMarkdown(question.meaningVi || 'Chưa có nghĩa').slice(0, 70)}`,
      ).join('\n').slice(0, 1024),
    });
  }
  return { content: '', embeds: [embed], components: [], attachments: [], files: [] };
}

export function buildAnsweredMessage(session: DictationSession, question: DictationQuestion) {
  const answerStatus = question.isCorrect ? '✅ Chính xác!' : '❌ Chưa chính xác.';
  const answerLines = [
    `${answerStatus} · Câu ${question.questionIndex + 1}/${session.questionCount}`,
    `Đáp án: **${escapeMarkdown(question.simplified)}**${question.traditional !== question.simplified ? ` (phồn thể: ${escapeMarkdown(question.traditional)})` : ''}`,
    `Pinyin: **${escapeMarkdown(question.pinyin)}**`,
    `Nghĩa: ${escapeMarkdown(question.meaningVi || 'Chưa có nghĩa trong từ điển.').slice(0, 500)}`,
    `Gợi ý: ${question.usedHint ? 'đã dùng' : 'chưa dùng'} · Nghe lại: ${question.replayCount} lần`,
  ];
  const next = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(controlId('next', session, question))
      .setLabel(question.questionIndex + 1 === session.questionCount ? 'Xem kết quả' : 'Câu tiếp theo')
      .setEmoji(question.questionIndex + 1 === session.questionCount ? '🏁' : '➡️')
      .setStyle(ButtonStyle.Primary),
  );
  return { content: answerLines.join('\n'), embeds: [], components: [next], attachments: [], files: [] };
}

export function buildSummary(session: DictationSession, questions: DictationQuestion[]) {
  const correct = questions.filter((question) => question.isCorrect === true).length;
  const incorrect = questions.length - correct;
  const accuracy = questions.length ? Math.round((correct / questions.length) * 100) : 0;
  const review = questions.filter((question) => question.isCorrect === false || question.usedHint);
  const embed = new EmbedBuilder()
    .setColor(accuracy === 100 ? 0x20c997 : 0x6c5ce7)
    .setTitle('🏁 Kết quả khảo bài')
    .setDescription([
      `Bộ **${escapeMarkdown(session.deckName).slice(0, 100)}**`,
      `Đúng: **${correct}** · Sai: **${incorrect}** · Chính xác: **${accuracy}%**`,
      `Tổng số câu: **${questions.length}**`,
    ].join('\n'))
    .setFooter({ text: 'Kết quả được lưu bền vững và dùng cho hệ thống XP tu vi.' });
  if (review.length) {
    for (let index = 0; index < review.length; index += 8) {
      const batch = review.slice(index, index + 8);
      const lines = batch.map((question) =>
        `• ${escapeMarkdown(question.simplified)} · ${escapeMarkdown(question.pinyin)} — `
        + `${escapeMarkdown(question.meaningVi || 'Chưa có nghĩa').slice(0, 40)}`
        + `${question.isCorrect ? ' (gợi ý)' : ' (sai)'}`,
      );
      embed.addFields({
        name: `📖 Từ cần ôn${review.length > 8 ? ` (${index + 1}–${index + batch.length})` : ''}`,
        value: lines.join('\n').slice(0, 1024),
      });
    }
  } else {
    embed.addFields({ name: '📖 Từ cần ôn', value: 'Không có — rất tốt!' });
  }
  return { content: '', embeds: [embed], components: [], attachments: [], files: [] };
}

function controlId(action: string, session: DictationSession, question: DictationQuestion): string {
  return `dictation:${action}:${session.id}:${question.questionIndex}`;
}
