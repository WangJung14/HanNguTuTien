import {
  ActionRowBuilder, ButtonInteraction, ModalBuilder, MessageFlags,
  ModalSubmitInteraction, StringSelectMenuBuilder, StringSelectMenuInteraction,
  TextInputBuilder, TextInputStyle,
} from 'discord.js';
import type { DictationService } from '../application/dictation.service.js';
import type { DictationQuestion } from '../domain/dictation.types.js';
import { DictationAudioError, DictationError } from '../domain/dictation.types.js';
import {
  buildAnsweredMessage, buildCountSelect, buildPaperQuestionMessage, buildPaperSummary,
  buildQuestionMessage, buildReadAnswers, buildSummary,
} from './dictation-ui.js';

type DictationRewardSink = {
  awardQuestion(guildId: string, userId: string, question: DictationQuestion): unknown;
  awardCompletion(guildId: string, userId: string, sessionId: string, questionCount: number,
    correctCount: number, allFirstTry: boolean): unknown;
};

export async function handleDictationSelect(
  interaction: StringSelectMenuInteraction,
  service: DictationService,
): Promise<void> {
  const [, action, ownerId, rawDeckOrMode, rawMode] = interaction.customId.split(':');
  if (!interaction.guildId || ownerId !== interaction.user.id) {
    await interaction.reply({ content: '⛔ Lựa chọn này không thuộc về đạo hữu.', flags: MessageFlags.Ephemeral });
    return;
  }
  const value = Number(interaction.values[0]);
  if (!Number.isSafeInteger(value) || value <= 0) {
    await interaction.reply({ content: 'Lựa chọn không hợp lệ hoặc đã hết hạn.', flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferUpdate();

  if (action === 'deck') {
    const mode = rawDeckOrMode === 'paper' ? 'paper' : 'discord';
    const candidates = await service.getEligibleQuestions(interaction.guildId, interaction.user.id, value);
    if (candidates.length < 5) {
      await interaction.editReply({
        content: `Bộ này chỉ có **${candidates.length}** từ đủ điều kiện; cần ít nhất 5. Hãy bổ sung từ hoặc chọn bộ khác.`,
        components: [],
      });
      return;
    }
    await interaction.editReply(buildCountSelect(interaction.user.id, value, candidates.length, mode));
    return;
  }

  if (action !== 'count') {
    await interaction.editReply({ content: 'Lựa chọn không được hỗ trợ.', components: [] });
    return;
  }
  const deckId = Number(rawDeckOrMode);
  if (!Number.isSafeInteger(deckId) || deckId <= 0) {
    await interaction.editReply({ content: 'Bộ từ đã chọn không hợp lệ.', components: [] });
    return;
  }
  if (!interaction.channelId) throw new DictationError('Không xác định được kênh để lưu phiên khảo bài.');
  const { session, question, audio } = await service.start(
    interaction.guildId, interaction.user.id, deckId, value, interaction.channelId,
    Math.random, rawMode === 'paper' ? 'paper' : 'discord',
  );
  const response = await interaction.editReply(buildQuestionMessage(session, question, audio));
  await service.bindMessage(session.id, response.id);
}

export async function handleDictationButton(
  interaction: ButtonInteraction,
  service: DictationService,
  xp?: DictationRewardSink,
): Promise<void> {
  const [, action, sessionId, rawIndex] = interaction.customId.split(':');
  const questionIndex = Number(rawIndex);
  if (!interaction.guildId || !sessionId || !Number.isSafeInteger(questionIndex) || questionIndex < 0) {
    await interaction.reply({ content: 'Nút này không hợp lệ hoặc đã hết hạn.', flags: MessageFlags.Ephemeral });
    return;
  }
  const session = await service.getOwnedSession(
    sessionId, interaction.guildId, interaction.user.id, interaction.message.id,
  );
  const question = await service.getCurrentQuestion(session, questionIndex);

  if (action === 'reveal') {
    if (session.mode !== 'paper') throw new DictationError('Nút này chỉ dùng trong chế độ viết giấy.');
    await interaction.reply({
      content: buildReadAnswers(await service.getReadQuestions(session)),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (action === 'answer') {
    if (session.mode === 'paper') throw new DictationError('Chế độ viết giấy không nhận đáp án trên Discord.');
    if (question.answeredAt) throw new DictationError('Câu này đã được chấm.');
    const modal = new ModalBuilder()
      .setCustomId(`dictation:submit:${session.id}:${questionIndex}`)
      .setTitle(`Trả lời câu ${questionIndex + 1}/${session.questionCount}`);
    const answer = new TextInputBuilder()
      .setCustomId('answer')
      .setLabel('Nhập chữ Hán bạn vừa nghe')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(100);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(answer));
    await interaction.showModal(modal);
    return;
  }

  await interaction.deferUpdate();
  if (action === 'hint') {
    if (session.mode === 'paper') throw new DictationError('Chế độ viết giấy không có gợi ý.');
    const updatedQuestion = await service.markHint(session, questionIndex);
    await interaction.editReply(buildQuestionMessage(session, updatedQuestion));
    return;
  }
  if (action === 'replay' || action === 'slow') {
    if (session.mode === 'paper' && action === 'slow') {
      throw new DictationError('Chế độ viết giấy chỉ có nút nghe lại ở tốc độ thường.');
    }
    try {
      const replay = await service.replay(session, questionIndex, action === 'slow' ? 'slow' : 'normal');
      await interaction.editReply(buildQuestionMessage(session, replay.question, replay.audio));
    } catch (error) {
      if (!(error instanceof DictationAudioError)) throw error;
      const message = buildQuestionMessage(session, question);
      await interaction.editReply({ ...message, content: `${error.message}\n${message.content}` });
    }
    return;
  }
  if (action === 'next') {
    let advanced;
    try {
      advanced = await service.advance(session, questionIndex);
    } catch (error) {
      if (!(error instanceof DictationAudioError)) throw error;
      const message = session.mode === 'paper'
        ? buildPaperQuestionMessage(session, question)
        : buildAnsweredMessage(session, question);
      await interaction.editReply({ ...message, content: `${error.message}\n${message.content}` });
      return;
    }
    if (advanced.session.status === 'completed') {
      const results = await service.getResults(session.id);
      if (session.mode === 'discord' && xp) {
        await xp.awardCompletion(session.guildId, session.userId, session.id, session.questionCount,
          results.filter((item) => item.isCorrect).length,
          results.every((item) => item.isCorrect && !item.usedHint && item.replayCount === 0));
      }
      await interaction.editReply(session.mode === 'paper'
        ? buildPaperSummary(session, results)
        : buildSummary(session, results));
      return;
    }
    if (!advanced.question || !advanced.audio) throw new Error('Next dictation question was not prepared.');
    await interaction.editReply(buildQuestionMessage(advanced.session, advanced.question, advanced.audio));
    return;
  }
  await interaction.editReply({ content: 'Nút không được hỗ trợ.', components: [] });
}

export async function handleDictationModal(
  interaction: ModalSubmitInteraction,
  service: DictationService,
  xp?: DictationRewardSink,
): Promise<void> {
  const [, action, sessionId, rawIndex] = interaction.customId.split(':');
  const questionIndex = Number(rawIndex);
  if (action !== 'submit' || !interaction.guildId || !sessionId ||
      !Number.isSafeInteger(questionIndex) || questionIndex < 0 || !interaction.message) {
    await interaction.reply({ content: 'Form trả lời không hợp lệ hoặc đã hết hạn.', flags: MessageFlags.Ephemeral });
    return;
  }
  const session = await service.getOwnedSession(
    sessionId, interaction.guildId, interaction.user.id, interaction.message.id,
  );
  if (session.mode === 'paper') {
    throw new DictationError('Chế độ viết giấy không nhận đáp án trên Discord.');
  }
  await interaction.deferUpdate();
  const answer = interaction.fields.getTextInputValue('answer');
  const result = await service.submitAnswer(session, questionIndex, answer);
  await xp?.awardQuestion(session.guildId, session.userId, result);
  await interaction.editReply(buildAnsweredMessage(session, result));
}
