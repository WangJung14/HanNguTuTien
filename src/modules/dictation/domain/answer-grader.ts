import type { DictationQuestion } from './dictation.types.js';

function normalizeAnswer(input: string): string {
  return input.normalize('NFKC').normalize('NFC')
    .replace(/[\p{P}\p{White_Space}]/gu, '');
}

export function gradeAnswer(answer: string, question: Pick<DictationQuestion, 'simplified' | 'traditional'>): boolean {
  const normalized = normalizeAnswer(answer);
  return normalized.length > 0 && (
    normalized === normalizeAnswer(question.simplified) ||
    normalized === normalizeAnswer(question.traditional)
  );
}
